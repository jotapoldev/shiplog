import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { parseSubject } from "./conventional.ts";
import { BRANCHES } from "./git.ts";

const run = promisify(execFile);
const git = async (cwd: string, args: string[]) => (await run("git", ["-C", cwd, ...args], { maxBuffer: 64 * 1024 * 1024 })).stdout;
const lines = (s: string) => s.split(/\r?\n/).filter(Boolean);

export type RawCommit = { hash: string; parents: string[]; at: string; email: string; author: string; raw: string };
export type Node = RawCommit & {
  row: number;
  col: number;
  branch: string;
  type: string;
  scope: string | null;
  subject: string;
  refs: string[];
  merge: boolean;
  /** Mismo commit (fecha de autor + subject) en otra rama: cherry-pick. */
  twins: string[];
};
/** Tramo de línea entre la fila `row` (columna `from`) y la fila `row + 1` (columna `to`). */
export type Seg = { row: number; from: number; to: number; branch: string };

/** Familia de una rama, para color y prioridad: main gana sobre uat, uat sobre develop, etc. */
export function family(branch: string) {
  const b = branch.toLowerCase();
  if (b === "main" || b === "master") return "main";
  if (["uat", "staging", "qa", "develop"].includes(b)) return b;
  for (const p of ["hotfix", "release", "feature"]) if (b.startsWith(`${p}/`)) return p;
  return "other";
}
const RANK = ["main", "uat", "staging", "qa", "develop", "hotfix", "release", "other", "feature"];
const rank = (b: string) => RANK.indexOf(family(b));

/**
 * Asigna carriles al estilo `git log --graph`: cada carril espera un hash; un commit ocupa el carril
 * que lo espera (o uno libre si es punta), los demás carriles que lo esperaban convergen en él.
 * Necesita orden hijo-antes-que-padre (git log --date-order lo cumple).
 */
export function layout(commits: RawCommit[], tips: [string, string][]) {
  const byHash = new Map(commits.map((c) => [c.hash, c]));

  // Rama de cada commit: se recorre el primer padre desde cada punta, en orden de prioridad.
  const branchOf = new Map<string, string>();
  for (const [name, tip] of [...tips].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))) {
    for (let h: string | undefined = tip; h && byHash.has(h) && !branchOf.has(h); h = byHash.get(h)!.parents[0]) branchOf.set(h, name);
  }
  const refsOf = new Map<string, string[]>();
  for (const [name, tip] of tips) refsOf.set(tip, [...(refsOf.get(tip) ?? []), name]);

  const twinKey = (c: RawCommit) => `${c.at}|${c.raw}`;
  const twinGroups = new Map<string, string[]>();
  for (const c of commits) if (c.parents.length < 2) twinGroups.set(twinKey(c), [...(twinGroups.get(twinKey(c)) ?? []), c.hash]);

  const lanes: (string | null)[] = [];
  const free = () => {
    const i = lanes.indexOf(null);
    return i === -1 ? lanes.push(null) - 1 : i;
  };
  let starts: { j: number; from: number }[] = [];
  const segs: Seg[] = [];
  const nodes: Node[] = [];
  const segBranch = (h: string) => branchOf.get(h) ?? "other";

  commits.forEach((c, row) => {
    let col = lanes.indexOf(c.hash);
    if (col === -1) col = free();
    for (const s of starts) segs.push({ row: row - 1, from: s.from, to: lanes[s.j] === c.hash ? col : s.j, branch: segBranch(lanes[s.j]!) });

    lanes.forEach((h, j) => h === c.hash && (lanes[j] = null));
    lanes[col] = c.parents[0] ?? null;
    const fresh = new Set<number>();
    const extra: { j: number; from: number }[] = [];
    for (const p of c.parents.slice(1)) {
      const k = lanes.indexOf(p);
      if (k === -1) {
        const n = free();
        lanes[n] = p;
        fresh.add(n);
      } else extra.push({ j: k, from: col });
    }
    starts = [...lanes.flatMap((h, j) => (h ? [{ j, from: fresh.has(j) ? col : j }] : [])), ...extra];
    // Un carril recién liberado al final se recorta para que el grafo no crezca de ancho.
    while (lanes.length && lanes.at(-1) === null && !starts.some((s) => s.j === lanes.length - 1)) lanes.pop();

    const branch = branchOf.get(c.hash) ?? "other";
    const twins = (twinGroups.get(twinKey(c)) ?? []).filter((h) => h !== c.hash);
    nodes.push({ ...c, ...parseSubject(c.raw), row, col, branch, refs: refsOf.get(c.hash) ?? [], merge: c.parents.length > 1, twins });
  });
  // Lo que sigue más abajo del límite cargado: el tramo baja hasta el borde.
  for (const s of starts) segs.push({ row: commits.length - 1, from: s.from, to: s.j, branch: segBranch(lanes[s.j]!) });

  const width = Math.max(1, ...nodes.map((n) => n.col + 1), ...segs.map((s) => Math.max(s.from, s.to) + 1));
  return { nodes, segs, width };
}

/** Ramas: las remotas de origin y las locales que no tienen par remoto. */
async function readTips(path: string) {
  const out = await git(path, ["for-each-ref", "--format=%(refname)%1f%(objectname)", "refs/remotes/origin", "refs/heads"]);
  const tips = new Map<string, string>();
  for (const l of lines(out)) {
    const [ref, hash] = l.split("\x1f");
    if (ref === "refs/remotes/origin/HEAD") continue;
    const name = ref.replace(/^refs\/(remotes\/origin|heads)\//, "");
    if (ref.startsWith("refs/remotes/") || !tips.has(name)) tips.set(name, hash);
  }
  return tips;
}

const FMT = "--format=%H%x1f%P%x1f%aI%x1f%ae%x1f%an%x1f%s";
const parse = (l: string): RawCommit => {
  const [hash, p, at, email, author, raw] = l.split("\x1f");
  return { hash, parents: p ? p.split(" ") : [], at, email, author, raw };
};

export type Pending = { from: string; to: string; commits: (RawCommit & { type: string; subject: string })[] };

export async function readGraph(path: string, limit: number) {
  const [tips, email] = await Promise.all([readTips(path), git(path, ["config", "user.email"]).then((s) => s.trim(), () => "")]);
  const refs = [...tips.values()];
  const commits = refs.length ? lines(await git(path, ["log", "--date-order", `-n${limit}`, FMT, ...new Set(refs)])).map(parse) : [];
  const graph = layout(commits, [...tips]);

  // Seguimiento entre ambientes: lo que una rama tiene y la siguiente no (cherry-picks cuentan como subidos).
  const envs = BRANCHES.filter((b) => tips.has(b));
  const envLogs = new Map(
    await Promise.all(envs.map(async (b) => [b, lines(await git(path, ["log", "--no-merges", FMT, tips.get(b)!])).map(parse)] as const)),
  );
  const ids = new Map([...envLogs].map(([b, cs]) => [b, new Set(cs.map((c) => `${c.at}|${c.raw}`))]));
  const diff = (from: string, to: string): Pending => ({
    from,
    to,
    commits: envLogs.get(from)!.filter((c) => !ids.get(to)!.has(`${c.at}|${c.raw}`)).map((c) => ({ ...c, ...parseSubject(c.raw) })),
  });
  const promote = envs.slice(1).map((to, i) => diff(envs[i], to));
  // Lo que llegó al último ambiente sin pasar por develop (hotfix por cherry-pick que falta bajar).
  const backport = envs.length > 1 ? diff(envs.at(-1)!, envs[0]) : null;

  let fetchedAt: string | null = null;
  try {
    const gitDir = (await git(path, ["rev-parse", "--absolute-git-dir"])).trim();
    fetchedAt = statSync(join(gitDir, "FETCH_HEAD")).mtime.toISOString();
  } catch {}

  return { ...graph, email: email.toLowerCase(), envs, promote, backport, fetchedAt, branches: [...tips.keys()], truncated: commits.length === limit };
}
