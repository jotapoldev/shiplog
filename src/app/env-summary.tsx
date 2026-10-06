import { ArrowRight, GitBranch } from "lucide-react";
import Link from "next/link";
import type { RepoEnvs } from "@/lib/envs";
import { family } from "@/lib/graph";

const short = (env: string) => (env === "develop" ? "dev" : env);
const nCommits = (n: number) => `${n} ${n === 1 ? "commit" : "commits"}`;
const SHOWN = 4;

/** Portada: qué tan lejos está cada repo de producción, con entrada directa a su vista de ramas. */
export function EnvSummary({ repos }: { repos: RepoEnvs[] }) {
  if (!repos.length) return null;
  const behind = repos.filter((r) => r.pending > 0);
  return (
    <section className="mb-10 rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5" aria-labelledby="env-summary">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="env-summary" className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
            <GitBranch className="size-5 text-primary" />
            Ramas y ambientes
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {behind.length
              ? `${behind.length} ${behind.length === 1 ? "repo tiene" : "repos tienen"} commits tuyos sin llegar a producción.`
              : "Todo lo tuyo ya llegó a la última rama de cada repo."}{" "}
            Según el último fetch.
          </p>
        </div>
        <Link href="/ramas" className="press flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-primary hover:bg-accent">
          Ver ramas
          <ArrowRight className="size-4" />
        </Link>
      </div>

      <ul className="mt-4 grid gap-2">
        {repos.slice(0, SHOWN).map((r) => (
          <li key={r.repo}>
            <Link
              href={`/ramas?repo=${encodeURIComponent(r.repo)}`}
              className="group grid gap-2 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-muted/70 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
            >
              <span className="truncate text-sm font-semibold">{r.repo}</span>
              <ol className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label={`Commits por rama en ${r.repo}`}>
                {r.envs.map(({ env, n }, i) => (
                  <li key={env} className="flex items-center gap-1.5">
                    {i > 0 && <span aria-hidden className="h-px w-3 bg-border" />}
                    <span
                      className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap"
                      style={{ background: `color-mix(in oklab, var(--b-${family(env)}) 14%, transparent)` }}
                      title={`${nCommits(n)} en origin/${env}`}
                    >
                      <span className="size-2 rounded-full" style={{ background: `var(--b-${family(env)})` }} />
                      {short(env)}
                      <span className="font-normal text-muted-foreground tabular-nums">{n}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <span className="text-sm whitespace-nowrap sm:text-right">
                {r.pending ? (
                  <span className="font-semibold text-[var(--t-fix)]">
                    {r.pending} sin llegar a {r.last}
                  </span>
                ) : (
                  <span className="text-muted-foreground">al día</span>
                )}
                {r.local > 0 && <span className="ml-2 text-muted-foreground">· {r.local} solo local</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {repos.length > SHOWN && (
        <p className="mt-2 px-3 text-sm text-muted-foreground">
          Y {repos.length - SHOWN} {repos.length - SHOWN === 1 ? "repo más" : "repos más"} en <Link href="/ramas" className="font-semibold text-primary hover:underline">Ramas</Link>.
        </p>
      )}
    </section>
  );
}
