import { eq, sql } from "drizzle-orm";
import { commits, getDb, repos } from "./db.ts";
import { autoLink } from "./tasks.ts";
import { DEFAULT_ENVS, ROOT, discoverRepos, inScope, isRepo, readCommits, repoName, samePath, toLocalPath } from "./git.ts";

export async function addRepoPath(path: string): Promise<{ error: string | null }> {
  path = toLocalPath(path.trim());
  if (!inScope(path)) return { error: `${path} está fuera de ${ROOT}. Solo cuentan los repos dentro de esa carpeta (SHIPLOG_ROOT).` };
  if (!(await isRepo(path))) return { error: `${path} no es un repositorio git. Usa la ruta de la carpeta que contiene .git.` };
  const db = await getDb();
  const known = (await db.select().from(repos)).find((r) => samePath(r.path, path));
  if (!known) await db.insert(repos).values({ path });
  else if (known.ignored) await db.update(repos).set({ ignored: false }).where(eq(repos.path, known.path));
  return { error: null };
}

export async function removeRepoPath(path: string) {
  const db = await getDb();
  // Se marca en vez de borrarlo: si no, el descubrimiento lo agregaría de nuevo en el próximo sync.
  await db.update(repos).set({ ignored: true }).where(eq(repos.path, path));
  await db.delete(commits).where(eq(commits.repo, repoName(path)));
}

/** Registra los repos nuevos que aparezcan bajo ROOT; los quitados a mano (ignored) no vuelven. */
async function registerDiscovered() {
  const db = await getDb();
  const known = await db.select().from(repos);
  const fresh = discoverRepos().filter((p) => !known.some((r) => samePath(r.path, p)));
  if (fresh.length) await db.insert(repos).values(fresh.map((path) => ({ path }))).onConflictDoNothing();
}

/** Repos que cuentan: no quitados a mano y dentro de ROOT. Si aún no hay ninguno (primer arranque), los descubre. */
export async function activeRepos() {
  const db = await getDb();
  if (!(await db.select().from(repos).limit(1)).length) await registerDiscovered();
  return (await db.select().from(repos)).filter((r) => !r.ignored && inScope(r.path));
}

/** Sincroniza todos los repos (descubriendo los nuevos bajo ROOT), o solo `only` (y lo registra si está dentro de ROOT). */
export async function syncRepos(only?: string) {
  if (only) only = toLocalPath(only);
  if (!only) await registerDiscovered();
  else {
    const { error } = await addRepoPath(only);
    if (error) return { added: 0, updated: 0, errors: [error] };
  }
  const db = await getDb();
  const targets = (await activeRepos()).filter((r) => !only || samePath(r.path, only));
  let added = 0;
  // Filas que ya existían y cambiaron (casi siempre: el commit llegó a otra rama).
  let updated = 0;
  const errors: string[] = [];
  for (const { path, branches } of targets) {
    try {
      const rows = await readCommits(path, branches);
      for (let i = 0; i < rows.length; i += 500) {
        // Upsert: refresca las ramas (cambian con cada push) y rellena body en filas viejas.
        // xmax = 0 distingue insertadas de actualizadas.
        const res = await db
          .insert(commits)
          .values(rows.slice(i, i + 500))
          .onConflictDoUpdate({
            target: commits.id,
            set: { body: sql`coalesce(excluded.body, ${commits.body})`, branches: sql`excluded.branches` },
            setWhere: sql`${commits.branches} is distinct from excluded.branches or (${commits.body} is null and excluded.body is not null)`,
          })
          .returning({ inserted: sql<boolean>`xmax = 0` });
        const inserted = res.filter((r) => r.inserted).length;
        added += inserted;
        updated += res.length - inserted;
      }
    } catch (e) {
      errors.push(`${repoName(path)}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  }
  await autoLink();
  return { added, updated, errors };
}

/** Ambientes que muestra cada repo en sus cuadritos: los que eligió o develop → qa → uat → main. */
export async function envsByRepo(): Promise<Record<string, string[]>> {
  return Object.fromEntries((await activeRepos()).map((r) => [repoName(r.path), r.branches ? r.branches.split(",") : DEFAULT_ENVS]));
}
