import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { ROOT } from "./config.ts";
import { parseSubject } from "./conventional.ts";

export { ROOT };

const run = promisify(execFile);
// El mensaje de execFile solo trae el comando; lo que explica la falla viene en stderr.
const git = (cwd: string, args: string[]) =>
  run("git", ["-C", cwd, ...args], { maxBuffer: 64 * 1024 * 1024 }).then(
    (r) => r.stdout,
    (e: { stderr?: string; code?: unknown; message: string }) => {
      // 0xC0000142: Windows no pudo ni arrancar git.exe (memoria o heap de escritorio agotado), no es culpa del repo.
      if (e.code === 0xc0000142)
        throw new Error("Windows no pudo iniciar git (0xC0000142), casi siempre por falta de memoria. Cierra programas pesados y reinicia la app (pnpm dev).");
      throw new Error(`git ${args.join(" ")} (código ${e.code}): ${e.stderr?.trim() || e.message.split("\n")[0]}`);
    },
  );

export const repoName = (path: string) => basename(path.replace(/[\\/]+$/, ""));
export const samePath = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

export function inScope(path: string) {
  const rel = relative(ROOT.toLowerCase(), resolve(path).toLowerCase());
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export const isRepo = (path: string) => git(path, ["rev-parse", "--git-dir"]).then(() => true, () => false);

/** Carpetas de primer nivel con .git propio; los worktrees (.git archivo) se saltan para no duplicar commits. */
export const discoverRepos = () =>
  readdirSync(ROOT)
    .map((d) => join(ROOT, d))
    .filter((p) => existsSync(join(p, ".git")) && statSync(join(p, ".git")).isDirectory());

/** Ramas remotas que cuentan como "subido", de menor a mayor ambiente. */
export const BRANCHES = ["develop", "qa", "uat", "main", "master"];

/** Commits propios (autor = git config user.email del repo), todas las ramas, sin merges. */
export async function readCommits(path: string) {
  const email = (await git(path, ["config", "user.email"])).trim();
  if (!email) throw new Error(`${repoName(path)}: falta git config user.email`);
  const author = ["--no-merges", "--fixed-strings", `--author=${email}`];
  const out = await git(path, ["log", "--all", ...author, "--format=%H%x1f%aI%x1f%s%x1f%b%x1e"]);
  const repo = repoName(path);
  const idOf = (authoredAt: string, raw: string) => `${repo}|${authoredAt}|${raw}`;

  // En qué ramas remotas está cada commit, según el último fetch del usuario (aquí no se hace fetch).
  // Se compara por id (fecha de autor + subject), así un cherry-pick cuenta como subido.
  const remotes = new Set((await git(path, ["branch", "-r", "--format=%(refname:short)"])).split(/\r?\n/).map((b) => b.trim()));
  const inBranch = new Map<string, Set<string>>();
  for (const b of BRANCHES.filter((b) => remotes.has(`origin/${b}`))) {
    const ids = await git(path, ["log", `origin/${b}`, ...author, "--format=%aI%x1f%s"]);
    inBranch.set(b, new Set(ids.split(/\r?\n/).filter(Boolean).map((l) => idOf(...(l.split("\x1f") as [string, string])))));
  }

  const rows = out
    .split("\x1e")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, authoredAt, raw, body = ""] = line.split("\x1f");
      const id = idOf(authoredAt, raw);
      const branches = [...inBranch].filter(([, ids]) => ids.has(id)).map(([b]) => b).join(",");
      const c = { id, hash, repo, authoredAt, day: authoredAt.slice(0, 10), body: body.trim() || null, branches };
      return { ...c, ...parseSubject(raw) };
    });
  // Cherry-picks comparten id; el upsert no admite el mismo id dos veces en un lote.
  return [...new Map(rows.map((r) => [r.id, r])).values()];
}
