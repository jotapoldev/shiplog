"use client";

import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const EASE = [0.23, 1, 0.32, 1] as const;
const ENVS = ["develop", "qa", "uat", "main"];

export type MiniCommit = { id: string; repo: string; type: string; scope: string | null; subject: string; hash: string; branches: string | null };

function groupBy<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
}

/** Cuatro cuadritos dev/qa/uat/main: lleno = ya está en esa rama remota. */
function Envs({ branches }: { branches: string | null }) {
  const b = new Set((branches ?? "").replace("master", "main").split(","));
  return (
    <span className="flex gap-0.5" title={branches ? `En ${branches.replace(/,/g, ", ")}` : "Solo local"}>
      {ENVS.map((e) => (
        <span key={e} className={cn("size-1.5 rounded-[2px]", b.has(e) ? "bg-primary" : "ring-1 ring-border ring-inset")} />
      ))}
    </span>
  );
}

function Topic({ label, commits }: { label: string; commits: MiniCommit[] }) {
  const [open, setOpen] = useState(false);
  const single = commits.length === 1;
  const c0 = commits[0];
  return (
    <li>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left sm:py-0 transition-colors duration-150 hover:bg-muted/70"
      >
        <span className="flex shrink-0 gap-0.5 sm:w-10">
          {commits.slice(0, 5).map((c) => (
            <span key={c.id} className="size-2 rounded-full" style={{ background: `var(--t-${c.type})` }} />
          ))}
        </span>
        <span className="line-clamp-2 min-w-0 flex-1 text-[15px] leading-snug sm:truncate">
          {single ? (
            <>
              {c0.scope && <span className="font-medium">{c0.scope} </span>}
              <span className={cn(c0.scope && "text-muted-foreground")}>{c0.subject}</span>
            </>
          ) : (
            <>
              <span className="font-medium">{label}</span>
              <span className="ml-2 text-muted-foreground">{c0.subject}</span>
            </>
          )}
        </span>
        {!single && <span className="shrink-0 rounded-full bg-muted px-2 text-xs font-semibold tabular-nums text-muted-foreground">{commits.length}</span>}
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground/60 transition-transform duration-200", open && "rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.14 } }}
            transition={{ duration: 0.22, ease: EASE }}
            className="ml-4 overflow-hidden border-l border-border sm:ml-[3.25rem]"
          >
            {commits.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-1.5 pl-3 text-sm">
                <span className="w-14 shrink-0 text-xs font-semibold" style={{ color: `var(--t-${c.type})` }}>
                  {c.type === "other" ? "sin tipo" : c.type}
                </span>
                <span className="min-w-0 flex-1 break-words">{c.subject}</span>
                <Envs branches={c.branches} />
                <span className="hidden w-16 shrink-0 font-mono text-xs text-muted-foreground sm:inline" title={c.hash}>
                  {c.hash.slice(0, 7)}
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

/** Commits del día por repo y por tema (scope): una fila por tema, el detalle al tocarla. */
export function DayCommits({ commits }: { commits: MiniCommit[] }) {
  const [more, setMore] = useState<Record<string, boolean>>({});
  const LIMIT = 4;
  return (
    <div className="space-y-5">
      {[...groupBy(commits, (c) => c.repo)].map(([repo, list]) => {
        const topics = [...groupBy(list, (c) => (c.scope ? c.scope.toLowerCase() : `·${c.id}`))];
        const shown = more[repo] ? topics : topics.slice(0, LIMIT);
        return (
          <div key={repo}>
            <div className="mb-1 flex items-baseline justify-between gap-3 px-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">{repo}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">{list.length}</span>
            </div>
            <ul>
              {shown.map(([key, cs]) => (
                <Topic key={key} label={cs[0].scope ?? cs[0].subject} commits={cs} />
              ))}
            </ul>
            {topics.length > LIMIT && (
              <button
                onClick={() => setMore((m) => ({ ...m, [repo]: !m[repo] }))}
                className="mt-0.5 h-8 cursor-pointer rounded-lg px-2 text-sm font-medium text-primary hover:bg-muted/70"
              >
                {more[repo] ? "Ver menos" : `+${topics.length - LIMIT} temas más`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
