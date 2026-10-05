import Link from "next/link";
import { fmt, rangeLabel } from "@/lib/dates";
import { type Commit, norm, queryTokens, search, stem } from "@/lib/search";
import { cn } from "@/lib/utils";
import { CopyButton } from "./client";

const ENVS = [
  ["develop", "dev"],
  ["qa", "qa"],
  ["uat", "uat"],
  ["main", "main"],
] as const;
const PLURAL: Record<string, string> = { fix: "fixes", ci: "ci", other: "sin tipo" };
const plural = (t: string, n: number) => (n === 1 ? (t === "other" ? "sin tipo" : t) : (PLURAL[t] ?? `${t}s`));
const nCommits = (n: number) => `${n} ${n === 1 ? "commit" : "commits"}`;
const envs = (c: Commit) => {
  const b = new Set((c.branches ?? "").split(",").filter(Boolean));
  if (b.has("master")) b.add("main");
  return b;
};

/** Resalta las palabras que coinciden con la búsqueda, sin importar tildes ni plural. */
function Hl({ text, toks }: { text: string; toks: string[] }) {
  return (
    <>
      {text.split(/([\p{L}\p{N}]+)/u).map((part, i) =>
        i % 2 && toks.some((t) => stem(norm(part)).startsWith(t)) ? (
          <mark key={i} className="rounded-[3px] bg-primary/15 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function EnvChips({ c }: { c: Commit }) {
  const b = envs(c);
  if (!b.size) return <span className="rounded-full bg-[color-mix(in_oklab,var(--t-fix)_15%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--t-fix)]">solo local</span>;
  return (
    <span className="flex gap-0.5">
      {ENVS.map(([k, label]) => (
        <span
          key={k}
          title={b.has(k) ? `Está en origin/${k}` : `No está en origin/${k}`}
          className={cn("rounded px-1 text-[10px] font-semibold tabular-nums", b.has(k) ? "bg-primary text-primary-foreground" : "text-muted-foreground/50 ring-1 ring-border")}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

/** "Todo en develop; 12 en qa, 3 en main; 2 solo locales." */
function envSentence(cs: Commit[]) {
  const n = (k: string) => cs.filter((c) => envs(c).has(k)).length;
  const local = cs.filter((c) => !envs(c).size).length;
  const parts = ENVS.map(([k]) => [k, n(k)] as const).filter(([, x]) => x > 0);
  if (!parts.length) return `Nada subido todavía: ${local === 1 ? "el commit está" : `los ${local} commits están`} solo en local.`;
  const all = parts.filter(([, x]) => x === cs.length).map(([k]) => k);
  const some = parts.filter(([, x]) => x < cs.length).map(([k, x]) => `${x} en ${k}`);
  const missing = ENVS.map(([k]) => k).filter((k) => !n(k));
  return [
    all.length ? `Todo está en ${all.join(", ")}` : "",
    some.length ? some.join(", ") : "",
    local ? `${local} solo en local` : "",
    missing.length && missing.length < ENVS.length ? `nada en ${missing.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ")
    .concat(".");
}

export async function SearchView({ q, today }: { q: string; today: string }) {
  const res = await search(q);
  const toks = queryTokens(q);
  const cs = res.commits;

  if (!cs.length && !res.tasks.length && !res.notes.length && !res.memories.length)
    return (
      <div className="py-16">
        <p className="font-display text-[clamp(1.75rem,5vw,2.75rem)] leading-tight font-semibold tracking-tight">No encontré nada con «{q}».</p>
        <p className="mt-3 text-muted-foreground">Prueba con menos palabras, el nombre del módulo como aparece en el commit (por ejemplo «permisos» o «modo oscuro») o un ticket como «#142».</p>
      </div>
    );

  const first = cs.at(-1);
  const last = cs[0];
  const repos = [...new Set(cs.map((c) => c.repo))];
  const types = [...cs.reduce((m, c) => m.set(c.type, (m.get(c.type) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const headline = cs.length
    ? `Sí: ${nCommits(cs.length)} ${
        first!.day === last.day
          ? `el ${fmt(last.day, { day: "numeric", month: "short", year: "numeric" })}`
          : `entre ${fmt(first!.day, { day: "numeric", month: "short" })} y ${fmt(last.day, { day: "numeric", month: "short", year: "numeric" })}`
      } en ${repos.length} ${repos.length === 1 ? "repo" : "repos"}.`
    : `No hay commits con «${q}», pero sí aparece en otras partes.`;
  const summaryText = [
    `«${q}»: ${headline}`,
    cs.length ? `Tipos: ${types.map(([t, n]) => `${n} ${plural(t, n)}`).join(", ")}.` : "",
    cs.length ? `Ambientes: ${envSentence(cs)}` : "",
    ...res.topics.slice(0, 8).map((t) => `- ${t.label}: ${nCommits(t.commits.length)} (${rangeLabel(t.commits.at(-1)!.day, t.commits[0].day)}), ${t.commits[0].subject}`),
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="pt-6 pb-10">
      <p className="text-sm text-muted-foreground">Resultado para «{q}»</p>
      <h1 className="mt-1 max-w-[26ch] font-display text-[clamp(1.75rem,5vw,3rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-balance">{headline}</h1>
      {cs.length > 0 && (
        <div className="mt-4 space-y-2 text-[15px]">
          <p>
            {types.map(([t, n], i) => (
              <span key={t}>
                <span className="font-semibold" style={{ color: `var(--t-${t})` }}>
                  {n} {plural(t, n)}
                </span>
                {i < types.length - 1 ? ", " : ""}
              </span>
            ))}
            . Último: <span className="text-muted-foreground">{last.subject}</span> ({fmt(last.day, { day: "numeric", month: "short" })}).
          </p>
          <p className="text-muted-foreground">{envSentence(cs)} Según el último fetch de cada repo.</p>
        </div>
      )}
      <div className="mt-3 -ml-2.5">
        <CopyButton text={summaryText} label="Copiar resumen" />
      </div>

      {res.topics.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold tracking-tight">Por tema</h2>
          <div className="mt-4 grid gap-3">
            {res.topics.slice(0, 15).map((t) => (
              <details key={t.key} className="group rounded-2xl bg-card ring-1 ring-border" open={res.topics.length <= 3}>
                <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4">
                  <span className="font-semibold">
                    <Hl text={t.label} toks={toks} />
                    <span className="ml-2 text-sm font-normal text-muted-foreground">{nCommits(t.commits.length)}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {rangeLabel(t.commits.at(-1)!.day, t.commits[0].day)}, {[...new Set(t.commits.map((c) => c.repo))].join(", ")}
                  </span>
                  <span className="basis-full text-sm text-muted-foreground">{envSentence(t.commits)}</span>
                </summary>
                <ul className="space-y-2 border-t border-border px-4 pt-3 pb-4">
                  {t.commits.map((c) => (
                    <li key={c.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 text-sm sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]">
                      <Link href={`/?from=${c.day}&to=${c.day}`} className="text-muted-foreground tabular-nums hover:text-primary">
                        {fmt(c.day, { day: "numeric", month: "short" })}
                      </Link>
                      <span className="min-w-0">
                        <span className="text-xs font-semibold" style={{ color: `var(--t-${c.type})` }}>
                          {c.type === "other" ? "" : `${c.type} `}
                        </span>
                        <Hl text={c.subject} toks={toks} />
                        <span className="ml-2 text-xs text-muted-foreground">
                          {c.repo} <span className="font-mono">{c.hash.slice(0, 7)}</span>
                        </span>
                        {c.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{c.body}</span>}
                      </span>
                      <span className="col-start-2 mt-1 sm:col-start-3 sm:mt-0">
                        <EnvChips c={c} />
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
          {res.topics.length > 15 && <p className="mt-3 text-sm text-muted-foreground">Y {res.topics.length - 15} temas más. Afina la búsqueda para verlos.</p>}
        </section>
      )}

      {res.tasks.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold tracking-tight">Tareas</h2>
          <ul className="mt-3 space-y-1.5">
            {res.tasks.map((t) => (
              <li key={t.id} className="flex items-baseline gap-3 text-[15px]">
                <span className={cn("w-20 shrink-0 text-xs font-semibold", t.status === "done" ? "text-[var(--t-docs)]" : t.status === "doing" ? "text-primary" : "text-muted-foreground")}>
                  {t.status === "done" ? "hecha" : t.status === "doing" ? "en curso" : "por hacer"}
                </span>
                <Link href="/?view=pendientes" className="min-w-0 hover:text-primary">
                  <Hl text={t.title} toks={toks} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {res.notes.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold tracking-tight">Notas del día</h2>
          <ul className="mt-3 space-y-2">
            {res.notes.map((n) => (
              <li key={n.day} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 text-sm">
                <Link href={`/?from=${n.day}&to=${n.day}`} className="text-muted-foreground hover:text-primary">
                  {fmt(n.day, { day: "numeric", month: "short" })}
                </Link>
                <span className="line-clamp-3">
                  <Hl text={n.body} toks={toks} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {res.memories.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold tracking-tight">En la memoria de Claude</h2>
          <ul className="mt-3 space-y-2">
            {res.memories.map((m) => (
              <li key={m.file} className="text-sm">
                <Link href="/?view=pendientes" className="font-medium hover:text-primary">
                  <Hl text={m.title} toks={toks} />
                </Link>
                <span className="text-muted-foreground"> {m.hook}</span>
                {m.date && <span className="ml-2 text-xs text-muted-foreground">{fmt(m.date, { day: "numeric", month: "short" })}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-10 text-xs text-muted-foreground">Hoy es {fmt(today, { weekday: "long", day: "numeric", month: "long" })}. Para ver lo subido más reciente, haz fetch en el repo y pulsa Sincronizar.</p>
    </div>
  );
}
