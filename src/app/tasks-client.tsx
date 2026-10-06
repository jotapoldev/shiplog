"use client";

import { Check, ChevronDown, Link2, Play, Plus, Trash2, Undo2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { TaskStatus } from "@/lib/db";
import { cn } from "@/lib/utils";
import { addTask, commitsOfDay, deleteTask, moveTask, setKeywords, sync, toggleCommit } from "./actions";

const EASE = [0.23, 1, 0.32, 1] as const;

export type LinkedCommit = { id: string; repo: string; hash: string; type: string; subject: string; day: string; source: string };
export type TaskView = {
  id: number;
  title: string;
  repo: string | null;
  note: string | null;
  keywords: string | null;
  status: TaskStatus;
  createdLabel: string;
  doneLabel: string | null;
  durationLabel: string | null;
  commits: LinkedCommit[];
};

const STATUS_LABEL: Record<TaskStatus, string> = { pending: "Por hacer", doing: "En curso", done: "Hecha" };

/** Cada 5 min, con la pestaña visible: sincroniza commits. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const tick = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 5 * 6e4) return;
      last = Date.now();
      await sync();
      router.refresh();
    };
    const id = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);
  return null;
}

/** Despliegue con altura animada: se usa poco y explica qué se abrió. */
function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.22, ease: EASE }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AddTask() {
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const error = await addTask({ title });
          if (error) return void toast.error(error);
          setTitle("");
        });
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Nueva tarea, por ejemplo: revisar el filtro de fechas #142"
        aria-label="Título de la tarea"
        maxLength={300}
        className="h-10 min-w-0 flex-1 rounded-full border border-input bg-card px-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <Button className="press h-10 gap-1.5 rounded-full px-4" disabled={pending || !title.trim()}>
        <Plus />
        Agregar
      </Button>
    </form>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold",
        status === "doing" && "bg-primary/12 text-primary",
        status === "pending" && "bg-muted text-muted-foreground",
        status === "done" && "bg-[color-mix(in_oklab,var(--t-docs)_15%,transparent)] text-[var(--t-docs)]",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function TaskCard({ task, today }: { task: TaskView; today: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const move = (s: TaskStatus) =>
    start(async () => {
      const error = await moveTask(task.id, s);
      if (error) toast.error(error);
      else if (s === "done") toast.success(`Hecha: ${task.title}`);
    });

  return (
    <motion.div layout="position" className={cn("rounded-2xl bg-card ring-1 ring-border", task.status === "done" && "opacity-80")}>
      <div className="flex items-start gap-3 p-4">
        <button
          onClick={() => move(task.status === "done" ? "pending" : "done")}
          disabled={pending}
          aria-label={task.status === "done" ? "Reabrir tarea" : "Marcar como hecha"}
          className={cn(
            "press mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            task.status === "done" ? "border-transparent bg-[var(--t-docs)] text-white" : "border-input hover:border-primary",
          )}
        >
          {task.status === "done" && <Check className="size-3.5" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <button onClick={() => setOpen((o) => !o)} className="block w-full text-left" aria-expanded={open}>
            <p className={cn("font-medium leading-snug", task.status === "done" && "line-through decoration-muted-foreground/50")}>{task.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <StatusPill status={task.status} />
              {task.repo && <span className="rounded-full bg-muted px-2 py-0.5">{task.repo}</span>}
              {task.commits.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Link2 className="size-3" />
                  {task.commits.length} {task.commits.length === 1 ? "commit" : "commits"}
                </span>
              )}
              <span>{task.doneLabel ? `${task.doneLabel}, en ${task.durationLabel}` : task.createdLabel}</span>
              <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
            </div>
          </button>
        </div>
        <div className="flex shrink-0 items-center">
          {task.status === "pending" && (
            <Button variant="ghost" size="icon" className="size-10" aria-label="Empezar" title="Empezar" disabled={pending} onClick={() => move("doing")}>
              <Play />
            </Button>
          )}
          {task.status === "doing" && (
            <Button variant="ghost" size="icon" className="size-10" aria-label="Volver a por hacer" title="Volver a por hacer" disabled={pending} onClick={() => move("pending")}>
              <Undo2 />
            </Button>
          )}
        </div>
      </div>

      <Reveal open={open}>
        <TaskDetails task={task} today={today} />
      </Reveal>
    </motion.div>
  );
}

function TaskDetails({ task, today }: { task: TaskView; today: string }) {
  const [pending, start] = useTransition();
  const [keywords, setKw] = useState(task.keywords ?? "");
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState(today);
  const [dayCommits, setDayCommits] = useState<LinkedCommit[] | null>(null);
  const linked = new Set(task.commits.map((c) => c.id));

  useEffect(() => {
    if (!picking) return;
    let alive = true;
    commitsOfDay(day).then((rows) => alive && setDayCommits(rows.map((c) => ({ ...c, source: "" }))));
    return () => {
      alive = false;
    };
  }, [picking, day]);

  return (
    <div className="space-y-4 border-t border-border px-4 pt-3 pb-4 text-sm">
      {task.note && <p className="whitespace-pre-wrap text-muted-foreground">{task.note}</p>}

      <label className="grid gap-1 text-xs text-muted-foreground">
        Palabras clave para vincular commits (separadas por coma; los #ticket del título ya cuentan)
        <input
          value={keywords}
          onChange={(e) => setKw(e.target.value)}
          onBlur={() => keywords !== (task.keywords ?? "") && start(() => setKeywords(task.id, keywords))}
          placeholder="modo oscuro, QA-123"
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>

      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">Commits vinculados</p>
        {task.commits.length ? (
          <ul className="space-y-1">
            {task.commits.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{c.hash.slice(0, 7)}</span>
                <span className="min-w-0 flex-1 truncate" title={c.subject}>
                  <span className="text-muted-foreground">{c.repo}: </span>
                  {c.subject}
                </span>
                {c.source === "auto" && <span className="text-xs text-muted-foreground">auto</span>}
                <Button variant="ghost" size="icon" className="size-8" aria-label="Desvincular" disabled={pending} onClick={() => start(() => toggleCommit(task.id, c.id, false))}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Ninguno todavía. Agrega palabras clave o elige commits a mano.</p>
        )}
      </div>

      {picking ? (
        <div className="rounded-xl bg-muted/60 p-3">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={day}
              max={today}
              onChange={(e) => setDay(e.target.value)}
              aria-label="Día de los commits"
              className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none"
            />
            <Button variant="ghost" className="h-10" onClick={() => setPicking(false)}>
              Listo
            </Button>
          </div>
          <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto">
            {dayCommits === null ? (
              <li className="py-2 text-muted-foreground">Cargando…</li>
            ) : dayCommits.length === 0 ? (
              <li className="py-2 text-muted-foreground">Sin commits ese día.</li>
            ) : (
              dayCommits.map((c) => (
                <li key={c.id}>
                  <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 hover:bg-card">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={linked.has(c.id)}
                      disabled={pending}
                      onChange={(e) => start(() => toggleCommit(task.id, c.id, e.target.checked))}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-muted-foreground">{c.repo}: </span>
                      {c.subject}
                    </span>
                  </label>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : (
        <Button variant="outline" className="press h-10 gap-2" onClick={() => setPicking(true)}>
          <Link2 />
          Vincular commits de un día
        </Button>
      )}

      <div className="flex justify-end">
        <Button
          variant="ghost"
          className="h-10 gap-2 text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() => start(() => deleteTask(task.id))}
        >
          <Trash2 />
          Borrar tarea
        </Button>
      </div>
    </div>
  );
}
