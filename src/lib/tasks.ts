import { eq, gte } from "drizzle-orm";
import { TASK_STATUS, type TaskStatus, commits, getDb, taskCommits, tasks } from "./db.ts";

type Task = typeof tasks.$inferSelect;
const localDay = (d: Date) => d.toLocaleDateString("sv-SE");

/** Ids de ticket (#8900, QA-123) y palabras clave (separadas por coma, 3+ letras) de una tarea. */
export function taskTokens(t: Pick<Task, "title" | "note" | "keywords">) {
  const text = `${t.title} ${t.note ?? ""} ${t.keywords ?? ""}`;
  const tickets = [...new Set(text.match(/#\d+\b|\b[A-Z][A-Z0-9]+-\d+\b/g) ?? [])];
  const words = (t.keywords ?? "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length >= 3 && !tickets.includes(k));
  return { tickets, words };
}

export function matches(tokens: ReturnType<typeof taskTokens>, text: string) {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    tokens.tickets.some((tk) => new RegExp(`(?<![\\w#-])${esc(tk)}(?!\\d)`, "i").test(text)) ||
    tokens.words.some((w) => text.toLowerCase().includes(w))
  );
}

/**
 * Re-vincula commits automáticos de todas las tareas. Los manuales no se tocan.
 * ponytail: ventana fija de 7 días antes de crear la tarea hasta que se cierra; ajustar si los tickets viven más.
 */
export async function autoLink() {
  const db = await getDb();
  const all = await db.select().from(tasks);
  const withTokens = all.map((t) => ({ t, tok: taskTokens(t) })).filter(({ tok }) => tok.tickets.length || tok.words.length);
  await db.delete(taskCommits).where(eq(taskCommits.source, "auto"));
  if (!withTokens.length) return;
  const since = localDay(new Date(Math.min(...withTokens.map(({ t }) => t.createdAt.getTime())) - 7 * 864e5));
  const pool = await db.select().from(commits).where(gte(commits.day, since));
  const links = withTokens.flatMap(({ t, tok }) => {
    const lo = localDay(new Date(t.createdAt.getTime() - 7 * 864e5));
    const hi = t.doneAt ? localDay(t.doneAt) : "9999";
    return pool
      .filter((c) => c.day >= lo && c.day <= hi && matches(tok, `${c.subject}\n${c.scope ?? ""}\n${c.body ?? ""}`))
      .map((c) => ({ taskId: t.id, commitId: c.id, source: "auto" as const }));
  });
  for (let i = 0; i < links.length; i += 500) await db.insert(taskCommits).values(links.slice(i, i + 500)).onConflictDoNothing();
}

/** Valida y crea una tarea. La entrada viene de la UI, de POST /api/tasks o de `pnpm task`. */
export async function createTask(input: unknown): Promise<{ error: string } | { task: Task }> {
  const o = (input ?? {}) as Record<string, unknown>;
  for (const k of ["title", "repo", "note", "keywords", "memoryFile"])
    if (o[k] !== undefined && typeof o[k] !== "string") return { error: `${k} debe ser texto.` };
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const title = str("title");
  if (!title) return { error: 'Falta el título. Envía { "title": "..." }.' };
  if (title.length > 300) return { error: `El título tiene ${title.length} caracteres; el máximo es 300.` };
  const status = (o.status ?? "pending") as TaskStatus;
  if (!TASK_STATUS.includes(status)) return { error: `status debe ser uno de: ${TASK_STATUS.join(", ")}.` };
  const now = new Date();
  const db = await getDb();
  const [task] = await db
    .insert(tasks)
    .values({
      title,
      repo: str("repo") || null,
      note: str("note").slice(0, 4000) || null,
      keywords: str("keywords") || null,
      memoryFile: str("memoryFile") || null,
      status,
      startedAt: status === "pending" ? null : now,
      doneAt: status === "done" ? now : null,
    })
    .returning();
  await autoLink();
  return { task };
}

/** pending → doing → done (o hacia atrás). Guarda cuándo empezó y cuándo terminó. */
export async function setTaskStatus(id: number, status: unknown): Promise<{ error: string } | { task: Task }> {
  if (!TASK_STATUS.includes(status as TaskStatus)) return { error: `status debe ser uno de: ${TASK_STATUS.join(", ")}.` };
  const db = await getDb();
  const [cur] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!cur) return { error: `No existe la tarea #${id}.` };
  const now = new Date();
  const [task] = await db
    .update(tasks)
    .set({
      status: status as TaskStatus,
      startedAt: status === "pending" ? null : (cur.startedAt ?? now),
      doneAt: status === "done" ? (cur.status === "done" ? cur.doneAt : now) : null,
    })
    .where(eq(tasks.id, id))
    .returning();
  return { task };
}

/** Vincular = "manual". Desvincular deja "excluded" para que autoLink no lo vuelva a poner. */
export async function linkCommits(taskId: number, commitIds: string[], on: boolean) {
  if (!commitIds.length) return;
  const source = on ? ("manual" as const) : ("excluded" as const);
  const db = await getDb();
  await db
    .insert(taskCommits)
    .values(commitIds.map((commitId) => ({ taskId, commitId, source })))
    .onConflictDoUpdate({ target: [taskCommits.taskId, taskCommits.commitId], set: { source } });
}
