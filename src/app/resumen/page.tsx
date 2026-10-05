import { and, desc, gte, lte } from "drizzle-orm";
import { addMonths, duration, fmt, isMonth, monthDays, monthEnd, monthLabel, todayLocal } from "@/lib/dates";
import { commits, getDb } from "@/lib/db";
import { loadTasks, localDay } from "../tasks-view";
import { Story, type StoryData } from "./story";

const ENV = ["solo local", "develop", "qa", "uat", "main"];
const level = (branches: string | null) => {
  const b = (branches ?? "").split(",");
  return b.includes("main") || b.includes("master") ? 4 : b.includes("uat") ? 3 : b.includes("qa") ? 2 : b.includes("develop") ? 1 : 0;
};
const PLURAL: Record<string, string> = { fix: "fixes", ci: "ci", other: "sin tipo" };
const plural = (t: string, n: number) => (n === 1 ? (t === "other" ? "sin tipo" : t) : (PLURAL[t] ?? `${t}s`));
const ranked = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]);

export const metadata = { title: "Resumen del mes" };

export default async function Resumen({ searchParams }: PageProps<"/resumen">) {
  const sp = await searchParams;
  const today = todayLocal();
  const month = typeof sp.month === "string" && isMonth(sp.month) && sp.month <= today.slice(0, 7) ? sp.month : today.slice(0, 7);
  const db = await getDb();
  const [rows, { all }] = await Promise.all([
    db
      .select()
      .from(commits)
      .where(and(gte(commits.day, `${month}-01`), lte(commits.day, monthEnd(month))))
      .orderBy(desc(commits.authoredAt)),
    loadTasks(),
  ]);

  const count = (key: (c: (typeof rows)[number]) => string) => ranked(rows.reduce((m, c) => m.set(key(c), (m.get(key(c)) ?? 0) + 1), new Map<string, number>()));
  const perDay = new Map(count((c) => c.day));
  const best = [...perDay].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const types = count((c) => c.type);
  const repos = count((c) => c.repo);
  const envCounts = ENV.map((_, i) => rows.filter((c) => level(c.branches) === i).length);
  const done = all
    .filter((t) => t.status === "done" && t.doneAt && localDay(t.doneAt).startsWith(month))
    .map((t) => ({ title: t.title, took: duration(t.doneAt!.getTime() - t.createdAt.getTime()) }));
  const label = monthLabel(month).replace(" de ", " ");

  const copy = [
    `${label}: ${rows.length} commits en ${repos.length} repos, ${perDay.size} días activos.`,
    `Tipos: ${types.map(([t, n]) => `${n} ${plural(t, n)}`).join(", ")}.`,
    `Repos: ${repos.map(([r, n]) => `${r} (${n})`).join(", ")}.`,
    best ? `Mejor día: ${fmt(best[0], { weekday: "long", day: "numeric", month: "long" })} con ${best[1]} commits.` : "",
    `Ambientes: ${ENV.map((e, i) => `${envCounts[i]} ${i ? `hasta ${e}` : e}`).join(", ")}.`,
    done.length ? `Tareas terminadas:\n${done.map((t) => `- ${t.title} (${t.took})`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const data: StoryData = {
    month,
    label,
    prev: addMonths(month, -1),
    next: addMonths(month, 1) <= today.slice(0, 7) ? addMonths(month, 1) : null,
    days: monthDays(month),
    // ponytail: tope de 900 puntos para que el canvas vaya fluido; un mes normal ronda 100-300.
    dots: [...rows]
      .reverse()
      .slice(0, 900)
      .map((c) => ({ day: c.day, type: c.type, repo: c.repo, env: level(c.branches) })),
    total: rows.length,
    activeDays: perDay.size,
    best: best ? { day: best[0], label: fmt(best[0], { weekday: "long", day: "numeric", month: "long" }), n: best[1], subjects: rows.filter((c) => c.day === best[0]).slice(0, 5).map((c) => c.subject) } : null,
    types: types.map(([t, n]) => ({ k: t, label: plural(t, n), n })),
    repos: repos.map(([k, n]) => ({ k, n })),
    envs: ENV.map((k, i) => ({ k, n: envCounts[i] })),
    done,
    copy,
  };
  return <Story data={data} />;
}
