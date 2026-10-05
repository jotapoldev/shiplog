import { desc, eq, ne } from "drizzle-orm";
import Markdown from "react-markdown";
import { duration, fmt, mondayOf } from "@/lib/dates";
import { commits, getDb, memoryState, taskCommits, tasks } from "@/lib/db";
import { type Memory, readMemories } from "@/lib/memory";
import { CopyButton } from "./client";
import { AddTask, type LinkedCommit, MemoryCard, type MemoryView, TaskCard, type TaskView } from "./tasks-client";

type Task = typeof tasks.$inferSelect;

export const localDay = (d: Date) => d.toLocaleDateString("sv-SE");
const time = (d: Date) => d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });

/** Todas las tareas con sus commits vinculados (sin los excluidos a mano). */
export async function loadTasks() {
  const db = await getDb();
  const [all, links] = await Promise.all([
    db.select().from(tasks).orderBy(desc(tasks.createdAt)),
    db
      .select({ taskId: taskCommits.taskId, source: taskCommits.source, c: commits })
      .from(taskCommits)
      .innerJoin(commits, eq(commits.id, taskCommits.commitId))
      .where(ne(taskCommits.source, "excluded"))
      .orderBy(desc(commits.authoredAt)),
  ]);
  const byTask = new Map<number, LinkedCommit[]>();
  for (const { taskId, source, c } of links)
    byTask.set(taskId, [...(byTask.get(taskId) ?? []), { id: c.id, repo: c.repo, hash: c.hash, type: c.type, subject: c.subject, day: c.day, source }]);
  return { all, byTask };
}

export type DoneTask = { id: number; title: string; durationLabel: string };

/** Tareas terminadas agrupadas por día local de cierre, para el timeline y los resúmenes copiables. */
export function doneByDay(all: Task[]) {
  const m = new Map<string, DoneTask[]>();
  for (const t of all) {
    if (t.status !== "done" || !t.doneAt) continue;
    const d = localDay(t.doneAt);
    m.set(d, [...(m.get(d) ?? []), { id: t.id, title: t.title, durationLabel: duration(t.doneAt.getTime() - t.createdAt.getTime()) }]);
  }
  return m;
}

function toView(t: Task, byTask: Map<number, LinkedCommit[]>, memories: Map<string, Memory>): TaskView {
  let suggestion: string | null = null;
  if (t.memoryFile && t.status !== "done") {
    const m = memories.get(t.memoryFile);
    if (!m) suggestion = "La memoria de esta tarea ya no existe. ¿Ya está resuelta?";
    else if (!m.open) suggestion = "La memoria ya no marca nada pendiente. ¿Ya está resuelta?";
  }
  return {
    id: t.id,
    title: t.title,
    repo: t.repo,
    note: t.note,
    keywords: t.keywords,
    status: t.status,
    createdLabel: `creada ${fmt(localDay(t.createdAt), { day: "numeric", month: "short" })}`,
    doneLabel: t.doneAt ? `hecha ${fmt(localDay(t.doneAt), { day: "numeric", month: "short" })} ${time(t.doneAt)}` : null,
    durationLabel: t.doneAt ? duration(t.doneAt.getTime() - t.createdAt.getTime()) : null,
    commits: byTask.get(t.id) ?? [],
    suggestion,
  };
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="flex items-baseline gap-2 font-display text-xl font-semibold tracking-tight">
        {title}
        <span className="text-base font-normal text-muted-foreground tabular-nums">{count}</span>
      </h2>
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  );
}

function Fold({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <details className="group mt-8 rounded-2xl ring-1 ring-border">
      <summary className="flex h-12 cursor-pointer items-center justify-between px-4 text-sm font-semibold">
        <span>
          {title} <span className="font-normal text-muted-foreground">{count}</span>
        </span>
        <span className="text-muted-foreground transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="grid gap-3 px-3 pb-3">{children}</div>
    </details>
  );
}

export async function PendingView({ today }: { today: string }) {
  const db = await getDb();
  const [{ all, byTask }, states] = await Promise.all([loadTasks(), db.select().from(memoryState)]);
  const memories = readMemories().filter((m) => m.type === "project");
  const memMap = new Map(memories.map((m) => [m.file, m]));
  const stateMap = new Map(states.map((s) => [s.file, s]));

  const active = all.filter((t) => t.status !== "done").sort((a, b) => (a.status === b.status ? 0 : a.status === "doing" ? -1 : 1));
  const view = (m: Memory): MemoryView => {
    const st = stateMap.get(m.file);
    const changed = Boolean(st && st.hash !== m.hash);
    return {
      file: m.file,
      title: m.title,
      hook: m.hook,
      dateLabel: m.date ? fmt(m.date, { day: "numeric", month: "short", year: "numeric" }) : "",
      repos: m.repos,
      hash: m.hash,
      updated: changed,
      hidden: st?.status === "hidden" && !changed,
      tracked: st?.status === "tracked",
    };
  };
  const views = memories.map((m) => ({ m, v: view(m) }));
  const quiet = (v: MemoryView) => stateMap.has(v.file) && !v.updated;
  const openMem = views.filter(({ m, v }) => m.open && !quiet(v));
  const context = views.filter(({ m, v }) => !m.open && !quiet(v));
  const hidden = views.filter(({ v }) => v.hidden);
  const card = ({ m, v }: { m: Memory; v: MemoryView }) => (
    <MemoryCard key={m.file} m={v}>
      <Markdown>{m.body}</Markdown>
    </MemoryCard>
  );

  return (
    <div className="pt-8">
      <AddTask />
      <Section title="Mis tareas" count={active.length}>
        {active.length ? (
          active.map((t) => <TaskCard key={t.id} task={toView(t, byTask, memMap)} today={today} />)
        ) : (
          <p className="text-sm text-muted-foreground">Nada en curso. Agrega una tarea arriba o empieza una de la memoria.</p>
        )}
      </Section>
      <Section title="Pendientes en la memoria de Claude" count={openMem.length}>
        {openMem.length ? openMem.map(card) : <p className="text-sm text-muted-foreground">La memoria no tiene trabajo abierto sin revisar.</p>}
      </Section>
      <Fold title="En curso o de contexto" count={context.length}>
        {context.map(card)}
      </Fold>
      <Fold title="Ocultas" count={hidden.length}>
        {hidden.map(card)}
      </Fold>
    </div>
  );
}

export async function DoneView({ today }: { today: string }) {
  const { all, byTask } = await loadTasks();
  const memMap = new Map(readMemories().map((m) => [m.file, m]));
  const done = all.filter((t) => t.status === "done" && t.doneAt).sort((a, b) => b.doneAt!.getTime() - a.doneAt!.getTime());
  if (!done.length)
    return (
      <div className="py-20 text-center">
        <p className="font-display text-2xl font-semibold">Todavía no hay tareas hechas.</p>
        <p className="mt-2 text-muted-foreground">Marca una tarea como hecha en Pendientes y aparecerá aquí con su duración.</p>
      </div>
    );

  const weeks = new Map<string, Task[]>();
  for (const t of done) {
    const w = mondayOf(localDay(t.doneAt!));
    weeks.set(w, [...(weeks.get(w) ?? []), t]);
  }

  return (
    <div className="pt-4">
      {[...weeks].map(([w, list]) => {
        const days = new Map<string, Task[]>();
        for (const t of list) days.set(localDay(t.doneAt!), [...(days.get(localDay(t.doneAt!)) ?? []), t]);
        const text = [
          `Semana del ${fmt(w, { day: "numeric", month: "short" })}: ${list.length} ${list.length === 1 ? "tarea hecha" : "tareas hechas"}`,
          ...list.map((t) => `- ${t.title} (${duration(t.doneAt!.getTime() - t.createdAt.getTime())})`),
        ].join("\n");
        return (
          <section key={w} className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-xl font-semibold tracking-tight">
                {w === mondayOf(today) ? "Esta semana" : `Semana del ${fmt(w, { day: "numeric", month: "long" })}`}
                <span className="ml-2 text-base font-normal text-muted-foreground tabular-nums">{list.length}</span>
              </h2>
              <CopyButton text={text} label="Copiar semana" />
            </div>
            {[...days].map(([d, ts]) => (
              <div key={d} className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <p className="pt-3 text-sm text-muted-foreground capitalize">{d === today ? "Hoy" : fmt(d, { weekday: "long", day: "numeric" })}</p>
                <div className="grid gap-3">
                  {ts.map((t) => (
                    <TaskCard key={t.id} task={toView(t, byTask, memMap)} today={today} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
