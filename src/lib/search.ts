import { desc } from "drizzle-orm";
import { commits, getDb, notes, tasks } from "./db.ts";

/** Minúsculas y sin tildes: "Configuración" == "configuracion". */
export const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** Plural español básico: permisos -> permiso, fixes -> fix. */
export const stem = (w: string) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
export const words = (s: string) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stem);
export const queryTokens = (q: string) => [...new Set(words(q))].filter((t) => t.length >= 2 || /\d/.test(t));

/**
 * Puntúa un documento: cada palabra buscada tiene que aparecer (como prefijo) en algún campo;
 * suma el peso del mejor campo. 0 = no coincide.
 * ponytail: escaneo lineal en memoria, sobra para miles de commits; índice FTS si llegan a cientos de miles.
 */
export function scorer(q: string) {
  const toks = queryTokens(q);
  return (fields: [string | null | undefined, number][]) => {
    if (!toks.length) return 0;
    const ws = fields.map(([text, w]) => [words(text ?? ""), w] as const);
    let score = 0;
    for (const t of toks) {
      let best = 0;
      for (const [list, w] of ws) if (w > best && list.some((x) => x.startsWith(t))) best = w;
      if (!best) return 0;
      score += best;
    }
    return score;
  };
}

export type Commit = typeof commits.$inferSelect;

export async function search(q: string) {
  const db = await getDb();
  const score = scorer(q);
  const [allCommits, allTasks, allNotes] = await Promise.all([
    db.select().from(commits).orderBy(desc(commits.authoredAt)),
    db.select().from(tasks).orderBy(desc(tasks.createdAt)),
    db.select().from(notes),
  ]);
  const hits = allCommits
    .map((c) => ({ c, s: score([[c.scope, 4], [c.subject, 3], [c.repo, 2], [c.type, 2], [c.body, 1]]) }))
    .filter((x) => x.s > 0);

  // Temas: el scope del commit (o el repo si no tiene) agrupa trabajo del mismo módulo.
  const groups = new Map<string, Commit[]>();
  for (const { c } of hits) {
    const key = c.scope ? norm(c.scope) : `repo:${c.repo}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const topics = [...groups]
    .map(([key, cs]) => ({ key, label: cs[0].scope ?? cs[0].repo, commits: cs, score: Math.max(...cs.map((c) => hits.find((h) => h.c === c)!.s)) }))
    .sort((a, b) => b.score - a.score || b.commits.length - a.commits.length);

  return {
    commits: hits.map((h) => h.c),
    topics,
    tasks: allTasks.filter((t) => score([[t.title, 3], [t.keywords, 2], [t.note, 1], [t.repo, 1]])),
    notes: allNotes.filter((n) => score([[n.body, 1]])).sort((a, b) => b.day.localeCompare(a.day)),
  };
}
