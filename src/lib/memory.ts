import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MEMORY_DIR } from "./config.ts";
import { discoverRepos, repoName } from "./git.ts";

export { MEMORY_DIR };

const OPEN = /pendiente|sin commitear|falta|standby|por confirmar|no corrido|sin correr/i;

export type Memory = {
  file: string;
  title: string;
  hook: string;
  type: string;
  body: string;
  date: string;
  repos: string[];
  open: boolean;
  hash: string;
};

/** Frontmatter plano: toma `clave: valor` de cualquier nivel (type y modified viven bajo metadata). */
export function parseMemory(raw: string) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  const meta: Record<string, string> = {};
  for (const line of (m?.[1] ?? "").split(/\r?\n/)) {
    const kv = /^\s*([\w-]+):\s*(.*?)\s*$/.exec(line);
    if (kv && kv[2]) meta[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  return { meta, body: (m?.[2] ?? raw).trim() };
}

export function readMemories(): Memory[] {
  let index: string;
  try {
    index = readFileSync(join(MEMORY_DIR, "MEMORY.md"), "utf8");
  } catch {
    return [];
  }
  const repoNames = discoverRepos().map(repoName);
  const out: Memory[] = [];
  for (const line of index.split(/\r?\n/)) {
    const e = /^- \[(.+?)\]\((.+?\.md)\)\s*(?:—|-)?\s*(.*)$/.exec(line.trim());
    if (!e) continue;
    const [, title, file, hook] = e;
    let raw: string;
    try {
      raw = readFileSync(join(MEMORY_DIR, file), "utf8");
    } catch {
      continue;
    }
    const { meta, body } = parseMemory(raw);
    const text = `${title}\n${hook}\n${body}`;
    out.push({
      file,
      title,
      hook,
      type: meta.type ?? "",
      body,
      date: (meta.modified ?? /\d{4}-\d{2}-\d{2}/.exec(text)?.[0] ?? "").slice(0, 10),
      repos: repoNames.filter((r) => new RegExp(`(?<![\\w-])${r}(?![\\w-])`).test(text)),
      open: OPEN.test(`${title}\n${hook}\n${body}`),
      hash: createHash("sha1").update(raw).digest("hex"),
    });
  }
  return out;
}
