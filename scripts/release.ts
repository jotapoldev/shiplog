// pnpm release <patch|minor|major>
//
// Sube la versión de package.json, agrega al CHANGELOG.md lo que hubo desde el último tag
// (agrupado por tipo de conventional commit), hace el commit y el tag vX.Y.Z. No hace push.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseSubject } from "../src/lib/conventional.ts";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const fail = (msg: string) => {
  console.error(`release: ${msg}`);
  process.exit(1);
};

const level = process.argv[2];
if (!["patch", "minor", "major"].includes(level)) fail("uso: pnpm release <patch|minor|major>");
if (git("status", "--porcelain")) fail("hay cambios sin commitear; commitea o descarta antes de publicar una versión.");

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);
const next = level === "major" ? `${major + 1}.0.0` : level === "minor" ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
if (git("tag", "--list", `v${next}`)) fail(`el tag v${next} ya existe.`);

let since = "";
try {
  since = git("describe", "--tags", "--abbrev=0");
} catch {} // primer release: todo el historial
const subjects = git("log", "--no-merges", "--format=%s", ...(since ? [`${since}..HEAD`] : [])).split("\n").filter(Boolean);
if (!subjects.length) fail(`no hay commits desde ${since}.`);

const SECTIONS: [string, (t: string) => boolean][] = [
  ["Features", (t) => t === "feat"],
  ["Fixes", (t) => t === "fix" || t === "perf"],
  ["Other", (t) => !["feat", "fix", "perf"].includes(t)],
];
const parsed = subjects.map(parseSubject);
const body = SECTIONS.map(([title, match]) => {
  const items = parsed.filter((c) => match(c.type)).map((c) => `- ${c.scope ? `**${c.scope}:** ` : ""}${c.subject}`);
  return items.length ? `### ${title}\n\n${items.join("\n")}\n` : "";
})
  .filter(Boolean)
  .join("\n");

const date = new Date().toISOString().slice(0, 10);
const entry = `## v${next} (${date})\n\n${body}`;
const head = "# Changelog\n\n";
const old = existsSync("CHANGELOG.md") ? readFileSync("CHANGELOG.md", "utf8").replace(head, "") : "";
writeFileSync("CHANGELOG.md", `${head}${entry}\n${old}`);
writeFileSync("package.json", JSON.stringify({ ...pkg, version: next }, null, 2) + "\n");

git("add", "package.json", "CHANGELOG.md");
git("commit", "-m", `chore(release): v${next}`);
git("tag", "-a", `v${next}`, "-m", `v${next}`);
console.log(`Shiplog v${next} listo (${subjects.length} commits desde ${since || "el inicio"}).`);
console.log("Publícalo con: git push --follow-tags");
