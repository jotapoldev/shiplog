import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { HOST_ROOT, ROOT } from "./config.ts";
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

const SKIP = new Set(["node_modules", "vendor", "target", "dist", "build"]);

/**
 * Repos con .git propio en cualquier subcarpeta de ROOT. No entra a un repo ya encontrado ni a carpetas
 * ocultas o de dependencias; los worktrees (.git archivo) se saltan para no duplicar commits.
 * ponytail: tope de 6 niveles para no recorrer el disco entero; subirlo si hay repos más hondos.
 */
export function discoverRepos(dir = ROOT, depth = 0): string[] {
  const git = join(dir, ".git");
  if (depth > 0 && existsSync(git) && statSync(git).isDirectory()) return [dir];
  if (depth >= 6) return [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // sin permiso o borrada mientras se recorría
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !SKIP.has(e.name))
    .flatMap((e) => discoverRepos(join(dir, e.name), depth + 1));
}

/** Traduce una ruta del host a la del contenedor (SHIPLOG_HOST_ROOT -> ROOT). Fuera de Docker no cambia nada. */
export function toLocalPath(path: string) {
  // Comparación de texto: el host puede ser Windows (C:\...) y el contenedor Linux, path.relative no sirve entre ambos.
  const slash = (p: string) => p.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const host = slash(HOST_ROOT);
  const p = slash(path);
  if (!host || !p.toLowerCase().startsWith(`${host.toLowerCase()}/`)) return path;
  return ROOT + p.slice(host.length);
}

/** Ramas que se siguen si el repo no tiene su propia lista, de menor a mayor ambiente. */
export const BRANCHES = ["develop", "qa", "uat", "main", "master"];

/** Lo que se dibuja cuando el repo no eligió sus ramas (master cuenta como main). */
export const DEFAULT_ENVS = ["develop", "qa", "uat", "main"];

/** Ramas de origin según el último fetch, sin origin/HEAD. */
export const remoteBranches = async (path: string) =>
  (await git(path, ["branch", "-r", "--format=%(refname:short)"]))
    .split(/\r?\n/)
    .map((b) => b.trim())
    .filter((b) => b.startsWith("origin/") && b !== "origin/HEAD")
    .map((b) => b.slice("origin/".length));

/** Ramas que sigue un repo, en orden de ambiente: las que eligió el usuario (repos.branches) o las por defecto, si existen. */
export const trackedBranches = (saved: string | null, available: string[]) =>
  (saved ? saved.split(",") : BRANCHES).filter((b) => available.includes(b));

/** Commits propios (autor = git config user.email del repo), todas las ramas, sin merges. */
export async function readCommits(path: string, saved: string | null = null) {
  const email = (await git(path, ["config", "user.email"])).trim();
  if (!email) throw new Error(`${repoName(path)}: falta git config user.email`);
  const author = ["--no-merges", "--fixed-strings", `--author=${email}`];
  const out = await git(path, ["log", "--all", ...author, "--format=%H%x1f%aI%x1f%s%x1f%b%x1e"]);
  const repo = repoName(path);
  const idOf = (authoredAt: string, raw: string) => `${repo}|${authoredAt}|${raw}`;

  // En qué ramas remotas está cada commit, según el último fetch del usuario (aquí no se hace fetch).
  // Se compara por id (fecha de autor + subject), así un cherry-pick cuenta como subido.
  const inBranch = new Map<string, Set<string>>();
  for (const b of trackedBranches(saved, await remoteBranches(path))) {
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
