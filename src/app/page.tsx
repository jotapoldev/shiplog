import { and, count, desc, eq, gte, inArray, lte, max } from "drizzle-orm";
import { Check, GitBranch, X } from "lucide-react";
import Link from "next/link";
import { cache } from "react";
import { TYPES } from "@/lib/conventional";
import { addDays, fmt, isDay, isMonth, mondayOf, monthEnd, monthLabel, rangeLabel, todayLocal } from "@/lib/dates";
import { commits, getDb, notes } from "@/lib/db";
import { activeRepos, envsByRepo } from "@/lib/sync";
import { summarizeEnvs } from "@/lib/envs";
import { DEFAULT_ENVS, ROOT, repoName } from "@/lib/git";
import { AnimatedItem, AnimatedList, CopyButton, FadeIn, NoteEditor, RepoMenu, SearchBox, Swap, SyncButton, TabNav, ThemeToggle, ViewSwitch } from "./client";
import { DayCommits } from "./day-commits";
import { EnvSummary } from "./env-summary";
import { Heatmap } from "./heatmap";
import { SearchView } from "./search-view";
import { FilterBar, FocusEscape } from "./filters";
import { AutoRefresh } from "./tasks-client";
import { type DoneTask, DoneView, PendingView, doneByDay, loadTasks } from "./tasks-view";

const PLURAL: Record<string, string> = { fix: "fixes", ci: "ci", other: "otros" };
const plural = (t: string, n: number) => (n === 1 ? t : (PLURAL[t] ?? `${t}s`));
const nCommits = (n: number) => `${n} ${n === 1 ? "commit" : "commits"}`;

type Commit = typeof commits.$inferSelect;
/** Una lectura por request aunque haya muchos días en pantalla. */
const repoEnvsCached = cache(envsByRepo);
type Href = (patch: Record<string, string>) => string;

function groupBy<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
}
const tally = <T,>(rows: T[], key: (r: T) => string) => [...groupBy(rows, key)].map(([k, v]) => ({ k, n: v.length })).sort((a, b) => b.n - a.n);

const commitLine = (c: Commit) => `- ${c.type === "other" ? "" : `${c.type}${c.scope ? `(${c.scope})` : ""}: `}${c.subject}`;

function dayText(day: string, rows: Commit[], note?: string, done: DoneTask[] = []) {
  const title = fmt(day, { weekday: "long", day: "numeric", month: "long" });
  const body = [...groupBy(rows, (c) => c.repo)].map(([repo, cs]) => `${repo}\n${cs.map(commitLine).join("\n")}`);
  const finished = done.length ? `Tareas terminadas\n${done.map((t) => `- ${t.title} (${t.durationLabel})`).join("\n")}` : "";
  return [title.charAt(0).toUpperCase() + title.slice(1), finished, ...body, note ? `Notas: ${note}` : ""].filter(Boolean).join("\n");
}

function summary(rows: Commit[]) {
  if (!rows.length) return null;
  const top = tally(rows, (c) => c.type)
    .filter((x) => x.k !== "other")
    .slice(0, 3)
    .map(({ k, n }) => ({ t: k, n }));
  const rest = rows.length - top.reduce((s, x) => s + x.n, 0);
  return { parts: rest ? [...top, { t: "other", n: rest }] : top, repos: new Set(rows.map((c) => c.repo)).size };
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const today = todayLocal();
  const repo = str("repo");
  const type = TYPES.includes(str("type")) ? str("type") : "";
  const q = str("q").trim().slice(0, 200);
  const view = ["pendientes", "hechas"].includes(str("view")) ? str("view") : "";
  const month = isMonth(str("month")) ? str("month") : "";
  const day = month && isDay(str("day")) && str("day").startsWith(month) ? str("day") : "";
  const hasRange = isDay(str("from")) || isDay(str("to"));
  const from = isDay(str("from")) ? str("from") : addDays(today, -30);
  const to = isDay(str("to")) ? str("to") : today;

  const current = { view, repo, type, month, day, from: hasRange ? from : "", to: hasRange ? to : "" };
  const href: Href = (patch) => {
    const q = new URLSearchParams(Object.entries({ ...current, ...patch }).filter(([, v]) => v)).toString();
    return q ? `/?${q}` : "/";
  };

  const db = await getDb();
  const scope = [repo ? eq(commits.repo, repo) : undefined, type ? eq(commits.type, type) : undefined];
  const weekStart = mondayOf(today);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [lo, hi] = month ? [`${month}-01`, monthEnd(month)] : [from, to];

  const [rows, heat, week, weekNotes, rangeNotes, repoRows, taskData, repoStats, envGroups, repoEnvs] = await Promise.all([
    // En foco se trae el mes entero sin filtros: las facetas (repo/tipo/día) se calculan aquí.
    db.select().from(commits).where(and(gte(commits.day, lo), lte(commits.day, hi), ...(month ? [] : scope))).orderBy(desc(commits.authoredAt)),
    db
      .select({ d: commits.day, t: commits.type, r: commits.repo, n: count() })
      .from(commits)
      .where(and(...scope))
      .groupBy(commits.day, commits.type, commits.repo),
    db.select().from(commits).where(gte(commits.day, weekStart)).orderBy(desc(commits.authoredAt)),
    db.select().from(notes).where(inArray(notes.day, weekDays)),
    db.select().from(notes).where(and(gte(notes.day, lo), lte(notes.day, hi))),
    activeRepos(),
    loadTasks(),
    db.select({ repo: commits.repo, n: count(), last: max(commits.authoredAt) }).from(commits).groupBy(commits.repo),
    db.select({ repo: commits.repo, branches: commits.branches, n: count() }).from(commits).groupBy(commits.repo, commits.branches),
    repoEnvsCached(),
  ]);
  const envSummary = summarizeEnvs(envGroups.filter((g) => g.repo in repoEnvs), (r) => repoEnvs[r]);
  const doneMap = doneByDay(taskData.all);
  const doneCount = [...doneMap.values()].flat().length;
  const activeTasks = taskData.all.filter((t) => t.status !== "done").length;
  const counts: Record<string, number> = {};
  for (const h of heat) counts[h.d] = (counts[h.d] ?? 0) + h.n;
  const noteMap = new Map(rangeNotes.map((n) => [n.day, n.body]));

  const ws = summary(week);
  const ms = month ? summary(rows) : null;
  const weekNoteMap = new Map(weekNotes.map((n) => [n.day, n.body]));
  const weekText = [
    ws ? `Semana del ${fmt(weekStart, { day: "numeric", month: "short" })}: ${ws.parts.map((p) => `${p.n} ${plural(p.t, p.n)}`).join(", ")} en ${ws.repos} repos` : "",
    ...weekDays
      .filter((d) => week.some((c) => c.day === d) || weekNoteMap.has(d) || doneMap.has(d))
      .map((d) => dayText(d, week.filter((c) => c.day === d), weekNoteMap.get(d), doneMap.get(d))),
  ].join("\n\n");


  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-8">
      <FadeIn i={0}>
        <header className="flex flex-wrap items-center justify-between gap-2 py-5 sm:flex-nowrap sm:gap-4">
          <Link href="/" className="font-display text-xl font-bold tracking-tight">
            Shiplog
          </Link>
          <SearchBox initial={q} />
          <div className="flex items-center gap-1">
            <RepoMenu paths={repoRows.map((r) => r.path)} root={ROOT} />
            <Link href="/ramas" aria-label="Ramas" title="Ramas y ambientes" className="press flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <GitBranch className="size-[18px]" />
            </Link>
            <SyncButton />
            <ThemeToggle />
          </div>
        </header>
      </FadeIn>

      {q ? (
        <FadeIn i={1}>
          <SearchView q={q} today={today} />
        </FadeIn>
      ) : (
        <>
      <section className="pt-8 pb-10 sm:pt-14">
        <FadeIn i={1}>
          <Swap k={month || "week"}>
            <h1 className="max-w-[22ch] font-display text-[clamp(2rem,6vw,3.75rem)] leading-[1.02] font-semibold tracking-[-0.03em] text-balance">
              {(month ? ms : ws) ? (
                <>
                  {month ? `${monthLabel(month).replace(" de ", " ")}:` : "Esta semana:"}{" "}
                  {(month ? ms! : ws!).parts.map((p, i, all) => (
                    <span key={p.t}>
                      <span style={{ color: `var(--t-${p.t})` }}>
                        {p.n} {plural(p.t, p.n)}
                      </span>
                      {i < all.length - 2 ? ", " : i === all.length - 2 ? " y " : ""}
                    </span>
                  ))}{" "}
                  en {(month ? ms! : ws!).repos} {(month ? ms! : ws!).repos === 1 ? "repo" : "repos"}.
                </>
              ) : month ? (
                `${monthLabel(month).replace(" de ", " ")} no tiene commits.`
              ) : (
                "Esta semana todavía no hay commits."
              )}
            </h1>
          </Swap>
          {ws && (
            <div className="mt-4 -ml-2.5">
              <CopyButton text={weekText} label="Copiar resumen de la semana" />
            </div>
          )}
        </FadeIn>

        <FadeIn i={2}>
          <Heatmap rows={heat} today={today} month={month} />
        </FadeIn>
      </section>

      <AutoRefresh />
      <FadeIn i={3}>
        <EnvSummary repos={envSummary} />
      </FadeIn>
      <FadeIn i={3}>
        <TabNav
          active={view}
          items={[
            { v: "", label: "Commits", n: 0 },
            { v: "pendientes", label: "Pendientes", n: activeTasks },
            { v: "hechas", label: "Hechas", n: doneCount },
            { v: "ramas", label: "Ramas", n: envSummary.filter((r) => r.pending).length, href: "/ramas" },
          ]}
        />
      </FadeIn>

      {view ? (
        <FadeIn i={4}>
          <ViewSwitch viewKey={view}>{view === "pendientes" ? <PendingView today={today} /> : <DoneView today={today} />}</ViewSwitch>
        </FadeIn>
      ) : (
        <>
      <FadeIn i={3}>
        <FilterBar
          repos={repoRows.map((r) => repoName(r.path)).sort().map((name) => ({ name, n: 0, last: null, ...repoStats.find((x) => x.repo === name) }))}
          types={TYPES}
          counts={counts}
          today={today}
          repo={repo}
          type={type}
          from={from}
          to={to}
          month={month}
          hasRange={hasRange}
        />
      </FadeIn>

      <FadeIn i={4}>
        <ViewSwitch viewKey={month ? `m-${month}` : "timeline"}>
          {month ? (
            <Focus month={month} rows={rows} noteMap={noteMap} doneMap={doneMap} repo={repo} type={type} day={day} today={today} href={href} />
          ) : (
            <Timeline rows={rows} noteMap={noteMap} doneMap={doneMap} from={from} to={to} today={today} href={href} />
          )}
        </ViewSwitch>
      </FadeIn>
        </>
      )}

        </>
      )}

    </main>
  );
}

type DoneMap = Map<string, DoneTask[]>;
type TimelineProps = { rows: Commit[]; noteMap: Map<string, string>; doneMap: DoneMap; from: string; to: string; today: string; href: Href };

function Timeline({ rows, noteMap, doneMap, from, to, today, href }: TimelineProps) {
  const byDay = groupBy(rows, (c) => c.day);
  const doneDays = [...doneMap.keys()].filter((d) => d >= from && d <= to);
  const days = [...new Set([...byDay.keys(), ...noteMap.keys(), ...doneDays, ...(today >= from && today <= to ? [today] : [])])].sort().reverse();

  const items: React.ReactNode[] = [];
  let lastMonth = "";
  for (const d of days) {
    const ym = d.slice(0, 7);
    if (ym !== lastMonth) {
      lastMonth = ym;
      items.push(
        <AnimatedItem key={`m-${ym}`} className="flex items-baseline justify-between gap-3 pt-10 pb-1">
          <h2 className="font-display text-xl font-semibold tracking-tight">{monthLabel(ym)}</h2>
          <Link href={href({ month: ym, day: "", from: "", to: "" })} className="text-sm font-semibold text-primary hover:underline">
            Ver mes en foco
          </Link>
        </AnimatedItem>,
      );
    }
    items.push(
      <AnimatedItem key={d} className="grid grid-cols-[minmax(0,1fr)] gap-x-8 border-b border-border py-8 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <DayBlock day={d} cs={byDay.get(d) ?? []} note={noteMap.get(d)} done={doneMap.get(d)} today={today} />
      </AnimatedItem>,
    );
  }

  return (
    <>
      <p className="pt-6 text-sm text-muted-foreground">
        {nCommits(rows.length)}, {rangeLabel(from, to)}
      </p>
      {days.length === 0 ? (
        <Empty />
      ) : (
        <AnimatedList>{items}</AnimatedList>
      )}
    </>
  );
}

function Empty() {
  return (
    <div className="py-20 text-center">
      <p className="font-display text-2xl font-semibold">Nada con estos filtros.</p>
      <p className="mt-2 text-muted-foreground">Amplía las fechas o quita filtros. Si acabas de agregar un repo, pulsa Sincronizar.</p>
    </div>
  );
}

async function DayBlock({ day, cs, note, done = [], today }: { day: string; cs: Commit[]; note?: string; done?: DoneTask[]; today: string }) {
  const repoEnvs = await repoEnvsCached();
  return (
    <>
      <div className="sm:sticky sm:top-6 sm:self-start">
        <p className="text-sm text-muted-foreground capitalize">{day === today ? "Hoy" : fmt(day, { weekday: "long" })}</p>
        <p className="font-display text-3xl font-semibold tracking-tight">{fmt(day, { day: "numeric", month: "short" })}</p>
        <p className="text-sm text-muted-foreground">{nCommits(cs.length)}</p>
        {cs.length > 0 && (
          <div className="mt-2 flex h-1.5 w-28 overflow-hidden rounded-full" title="Mezcla de tipos del día">
            {[...groupBy(cs, (c) => c.type)].map(([t, l]) => (
              <span key={t} style={{ width: `${(l.length / cs.length) * 100}%`, background: `var(--t-${t})` }} />
            ))}
          </div>
        )}
        <div className="mt-1 -ml-2.5">
          <CopyButton text={dayText(day, cs, note, done)} label="Copiar día" />
        </div>
      </div>
      <div className="mt-4 space-y-6 sm:mt-0">
        {done.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Tareas terminadas</h3>
            <ul className="space-y-1.5">
              {done.map((t) => (
                <li key={t.id} className="flex items-baseline gap-3 text-[15px] leading-snug">
                  <span className="flex w-16 shrink-0 items-center gap-1 text-xs font-semibold text-[var(--t-docs)]">
                    <Check className="size-3.5 self-center" strokeWidth={3} />
                    hecha
                  </span>
                  <span className="min-w-0 flex-1">{t.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t.durationLabel}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {cs.length > 0 && (
          <DayCommits commits={cs.map(({ id, repo, type, scope, subject, hash, branches }) => ({ id, repo, type, scope, subject, hash, branches, envs: repoEnvs[repo] ?? DEFAULT_ENVS }))} />
        )}
        <NoteEditor key={`${day}:${note ?? ""}`} day={day} initial={note ?? ""} />
      </div>
    </>
  );
}

type FocusProps = { month: string; rows: Commit[]; noteMap: Map<string, string>; doneMap: DoneMap; repo: string; type: string; day: string; today: string; href: Href };

function Focus({ month, rows, noteMap, doneMap, repo, type, day, today, href }: FocusProps) {
  const list = rows.filter((c) => (!repo || c.repo === repo) && (!type || c.type === type) && (!day || c.day === day));
  const byDay = groupBy(list, (c) => c.day);
  const extraDays = [...noteMap.keys(), ...[...doneMap.keys()].filter((d) => d.startsWith(month))];
  const noteDays = !repo && !type ? extraDays.filter((d) => !day || d === day) : [];
  const days = [...new Set([...byDay.keys(), ...noteDays])].sort().reverse();

  return (
    <section className="pt-6">
      <FocusEscape exitHref={href({ month: "", day: "" })} />
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          {nCommits(list.length)} en {monthLabel(month).replace(" de ", " ")}
        </span>
        {day && (
          <Link
            href={href({ day: "" })}
            scroll={false}
            className="press inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-background"
          >
            Solo el {fmt(day, { weekday: "long", day: "numeric" })}
            <X className="size-3.5" />
          </Link>
        )}
      </div>
      {days.length === 0 ? (
        <Empty />
      ) : (
        <AnimatedList className="mt-2">
          {days.map((d) => (
            <AnimatedItem key={d} className="grid grid-cols-[minmax(0,1fr)] gap-x-8 border-b border-border py-8 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <DayBlock day={d} cs={byDay.get(d) ?? []} note={noteMap.get(d)} done={doneMap.get(d)} today={today} />
            </AnimatedItem>
          ))}
        </AnimatedList>
      )}
    </section>
  );
}
