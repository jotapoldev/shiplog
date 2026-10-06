/** Resumen de ambientes por repo a partir de commits agrupados por (repo, branches). Sin I/O, para poder probarlo. */

export type EnvGroup = { repo: string; branches: string | null; n: number };
export type RepoEnvs = { repo: string; envs: { env: string; n: number }[]; local: number; total: number; pending: number; last: string };

/** master cuenta como main: así los repos viejos se ven igual que los nuevos. */
const inBranch = (set: Set<string>, env: string) => set.has(env) || (env === "main" && set.has("master"));

export function summarizeEnvs(groups: EnvGroup[], envsOf: (repo: string) => string[]): RepoEnvs[] {
  const by = new Map<string, EnvGroup[]>();
  for (const g of groups) by.set(g.repo, [...(by.get(g.repo) ?? []), g]);
  return [...by]
    .map(([repo, gs]) => {
      const envs = envsOf(repo);
      const sets = gs.map((g) => ({ set: new Set((g.branches ?? "").split(",").filter(Boolean)), n: g.n }));
      const count = (f: (s: Set<string>) => boolean) => sets.reduce((acc, x) => acc + (f(x.set) ? x.n : 0), 0);
      const [first, last] = [envs[0], envs.at(-1)!];
      return {
        repo,
        envs: envs.map((env) => ({ env, n: count((s) => inBranch(s, env)) })),
        local: count((s) => !s.size),
        total: count(() => true),
        // Subido a la primera rama pero todavía no a la última (normalmente develop sin llegar a main).
        pending: envs.length > 1 ? count((s) => inBranch(s, first) && !inBranch(s, last)) : 0,
        last,
      };
    })
    .sort((a, b) => b.pending - a.pending || b.total - a.total);
}
