import { eq, sql } from "drizzle-orm";
import { commits, getDb, repos } from "./db.ts";
import { autoLink } from "./tasks.ts";
import { ROOT, inScope, isRepo, readCommits, repoName, samePath } from "./git.ts";

export async function addRepoPath(path: string): Promise<{ error: string | null }> {
  path = path.trim();
  if (!inScope(path)) return { error: `${path} está fuera de ${ROOT}. Solo cuentan los repos dentro de esa carpeta (SHIPLOG_ROOT).` };
  if (!(await isRepo(path))) return { error: `${path} no es un repositorio git. Usa la ruta de la carpeta que contiene .git.` };
  const db = await getDb();
  if (!(await db.select().from(repos)).some((r) => samePath(r.path, path))) await db.insert(repos).values({ path });
  return { error: null };
}

export async function removeRepoPath(path: string) {
  const db = await getDb();
  await db.delete(repos).where(eq(repos.path, path));
  await db.delete(commits).where(eq(commits.repo, repoName(path)));
}

/** Sincroniza todos los repos registrados, o solo `only` (y lo registra si está dentro de ROOT y aún no estaba). */
export async function syncRepos(only?: string) {
  if (only) {
    const { error } = await addRepoPath(only);
    if (error) return { added: 0, errors: [error] };
  }
  const db = await getDb();
  const paths = (await db.select().from(repos)).map((r) => r.path).filter((p) => inScope(p) && (!only || samePath(p, only)));
  let added = 0;
  const errors: string[] = [];
  for (const path of paths) {
    try {
      const rows = await readCommits(path);
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
        added += res.filter((r) => r.inserted).length;
      }
    } catch (e) {
      errors.push(`${repoName(path)}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  }
  await autoLink();
  return { added, errors };
}
