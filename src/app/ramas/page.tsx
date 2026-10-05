import { count, desc, max } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { commits, getDb, repos } from "@/lib/db";
import { ROOT, repoName } from "@/lib/git";
import { family, readGraph } from "@/lib/graph";
import { FadeIn, RepoMenu, ThemeToggle } from "../client";
import { Graph, Pipeline, RepoSelect } from "./graph";

export const metadata: Metadata = { title: "Ramas · Shiplog" };

const LIMITS = [150, 400, 1000];
const nCommits = (n: number) => `${n} ${n === 1 ? "commit" : "commits"}`;

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  const d = Math.round(min / 60 / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

export default async function Ramas({ searchParams }: PageProps<"/ramas">) {
  const sp = await searchParams;
  const db = await getDb();
  const [repoRows, [latest], stats] = await Promise.all([
    db.select().from(repos),
    db.select({ repo: commits.repo }).from(commits).orderBy(desc(commits.authoredAt)).limit(1),
    db.select({ repo: commits.repo, n: count(), last: max(commits.authoredAt) }).from(commits).groupBy(commits.repo),
  ]);
  const names = repoRows.map((r) => repoName(r.path)).sort();
  const asked = typeof sp.repo === "string" ? sp.repo : "";
  const repo = names.includes(asked) ? asked : names.includes(latest?.repo ?? "") ? latest!.repo : names[0];
  const limit = LIMITS.includes(Number(sp.n)) ? Number(sp.n) : LIMITS[0];
  const path = repoRows.find((r) => repoName(r.path) === repo)?.path;

  const res = path ? await readGraph(path, limit).catch((e: unknown) => (e instanceof Error ? e.message.split("\n")[0] : String(e))) : "";
  const g = typeof res === "string" ? null : res;
  const error = typeof res === "string" ? res : "";

  const gap = g?.promote.find((p) => p.commits.length);
  const headline = !g
    ? ""
    : g.envs.length < 2
      ? `${repo} no tiene ambientes remotos que comparar.`
      : gap
        ? `${gap.from} tiene ${nCommits(gap.commits.length)} que ${gap.to} todavía no tiene.`
        : `Todos los ambientes de ${repo} están al día.`;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
      <FadeIn i={0}>
        <header className="flex items-center justify-between gap-2 py-5">
          <div className="flex items-center gap-1">
            <Link href="/" className="press -ml-2 flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground" aria-label="Volver a Shiplog">
              <ArrowLeft className="size-5" />
            </Link>
            <Link href="/" className="font-display text-xl font-bold tracking-tight">
              Shiplog
            </Link>
            <span className="font-display text-xl font-bold tracking-tight text-muted-foreground">/ Ramas</span>
          </div>
          <div className="flex items-center gap-1">
            <RepoMenu paths={repoRows.map((r) => r.path)} root={ROOT} />
            <ThemeToggle />
          </div>
        </header>
      </FadeIn>

      <FadeIn i={1}>
        <div className="pt-2">
          <RepoSelect repos={names.map((name) => ({ name, n: 0, last: null, ...stats.find((x) => x.repo === name) }))} value={repo} />
        </div>
      </FadeIn>

      {!g ? (
        <div className="py-20">
          <p className="font-display text-2xl font-semibold">No pude leer {repo ?? "ningún repo"}.</p>
          <p className="mt-2 text-muted-foreground">{error || "Agrega un repo desde el botón Repositorios del encabezado."}</p>
        </div>
      ) : (
        <>
          <section className="pt-10 pb-8 sm:pt-14">
            <FadeIn i={2}>
              <p className="text-sm text-muted-foreground">
                {g.fetchedAt ? `Último fetch ${ago(g.fetchedAt)}` : "Sin fetch registrado"}; corre <code className="font-mono text-[0.85em]">git fetch</code> para ver lo más nuevo.
              </p>
              <h1 className="mt-2 max-w-[24ch] font-display text-[clamp(2rem,5.5vw,3.5rem)] leading-[1.04] font-semibold tracking-[-0.03em] text-balance">
                {headline}
              </h1>
            </FadeIn>
            {g.envs.length > 1 && (
              <FadeIn i={3}>
                <Pipeline envs={g.envs} fams={Object.fromEntries(g.envs.map((e) => [e, family(e)]))} promote={g.promote} backport={g.backport} email={g.email} />
              </FadeIn>
            )}
          </section>

          <div>
            <Graph
              key={`${repo}-${limit}`}
              nodes={g.nodes.map(({ hash, row, col, branch, type, scope, subject, refs, merge, twins, at, author, email }) => ({
                hash,
                row,
                col,
                branch,
                fam: family(branch),
                type,
                scope,
                subject,
                refs: refs.map((name) => ({ name, fam: family(name) })),
                merge,
                twins,
                at,
                author,
                mine: !!g.email && email.toLowerCase() === g.email,
              }))}
              segs={g.segs.map((s) => ({ ...s, fam: family(s.branch) }))}
              width={g.width}
            />
            {g.truncated && (
              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>Mostrando los {g.nodes.length} commits más recientes.</span>
                {LIMITS.filter((l) => l > limit).slice(0, 1).map((l) => (
                  <Link key={l} href={`/ramas?repo=${encodeURIComponent(repo)}&n=${l}`} scroll={false} className="font-semibold text-primary hover:underline">
                    Cargar {l}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
