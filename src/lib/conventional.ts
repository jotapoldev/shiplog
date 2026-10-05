export const TYPES = ["feat", "fix", "refactor", "chore", "docs", "style", "perf", "test", "ci", "build", "other"];
const RE = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/;

/** "fix(users): algo" -> { type: "fix", scope: "users", subject: "algo" }; sin prefijo o tipo raro (wip, release) -> "other". */
export function parseSubject(raw: string) {
  const m = RE.exec(raw.trim());
  if (!m) return { type: "other", scope: null, subject: raw.trim() };
  const type = m[1].toLowerCase();
  return { type: TYPES.includes(type) ? type : "other", scope: m[2] || null, subject: m[3] };
}
