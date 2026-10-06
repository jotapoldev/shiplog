import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { RepoEnvs } from "@/lib/envs";

const SHOWN = 5;

/** Portada: qué tan cerca de producción está lo tuyo en cada repo; cada fila lleva a su vista de ramas. */
export function EnvSummary({ repos }: { repos: RepoEnvs[] }) {
  if (!repos.length) return null;
  return (
    <section className="mb-10" aria-labelledby="env-summary">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="env-summary" className="font-display text-lg font-semibold tracking-tight">
          Ramas y ambientes
        </h2>
        <Link href="/ramas" className="press flex h-10 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-primary hover:bg-accent">
          Ver ramas
          <ArrowRight className="size-4" />
        </Link>
      </div>
      <ul className="grid gap-1">
        {repos.slice(0, SHOWN).map((r) => {
          const reached = r.envs.at(-1)?.n ?? 0;
          const base = reached + r.pending;
          const pct = base ? Math.round((reached / base) * 100) : 100;
          return (
            <li key={r.repo}>
              <Link
                href={`/ramas?repo=${encodeURIComponent(r.repo)}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-muted/70 sm:min-h-10 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_8.5rem] sm:py-0"
                title={`${reached} de ${base} commits tuyos ya están en ${r.last}`}
              >
                <span className="truncate text-sm font-medium">{r.repo}</span>
                <span className="text-right text-sm tabular-nums whitespace-nowrap sm:col-start-3 sm:row-start-1">
                  {r.pending ? (
                    <span className="font-semibold">
                      {r.pending} <span className="font-normal text-muted-foreground">sin {r.last}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">al día</span>
                  )}
                </span>
                <span className="col-span-2 h-2 overflow-hidden rounded-full bg-muted sm:col-span-1 sm:col-start-2 sm:row-start-1" role="img" aria-label={`${pct} % en ${r.last}`}>
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {repos.length > SHOWN && (
        <p className="mt-1 px-2 text-sm text-muted-foreground">
          y {repos.length - SHOWN} {repos.length - SHOWN === 1 ? "repo más" : "repos más"} en{" "}
          <Link href="/ramas" className="font-semibold text-primary hover:underline">
            Ramas
          </Link>
        </p>
      )}
    </section>
  );
}
