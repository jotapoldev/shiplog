import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSubject } from "./conventional.ts";
import { join } from "node:path";
import { ROOT, inScope } from "./git.ts";

test("parseSubject", () => {
  assert.deepEqual(parseSubject("fix(svg-icon): evitar mismatch"), { type: "fix", scope: "svg-icon", subject: "evitar mismatch" });
  assert.deepEqual(parseSubject("Feat!: rompe todo"), { type: "feat", scope: null, subject: "rompe todo" });
  assert.equal(parseSubject("ci: pipeline").type, "ci");
  assert.equal(parseSubject("wip: algo").type, "other");
  assert.deepEqual(parseSubject("Merge branch qa"), { type: "other", scope: null, subject: "Merge branch qa" });
});

test("inScope", () => {
  assert.ok(inScope(join(ROOT, "api")));
  assert.ok(inScope(`${join(ROOT, "mi-repo").toLowerCase()}/`));
  assert.ok(!inScope(ROOT));
  assert.ok(!inScope(`${ROOT}-otro/x`));
  assert.ok(!inScope(join(ROOT, "..", "otra-carpeta")));
});

test("taskTokens y matches", async () => {
  const { taskTokens, matches } = await import("./tasks.ts");
  const tok = taskTokens({ title: "Fechas en empleados #142 y QA-12", note: null, keywords: "modo oscuro, #142" });
  assert.deepEqual(tok, { tickets: ["#142", "QA-12"], words: ["modo oscuro"] });
  assert.ok(matches(tok, "fix(ui): selector de rango (#142, #143)"));
  assert.ok(!matches(tok, "fix: algo #1420"));
  assert.ok(matches(tok, "feat: Modo Oscuro del panel"));
  assert.ok(matches(tok, "refs qa-12"));
  assert.ok(!matches(tok, "refs XQA-12"));
});

test("búsqueda: tildes, plurales, prefijos y tickets", async () => {
  const { scorer } = await import("./search.ts");
  const s = scorer("permisos configuracion");
  assert.ok(s([["Configuración de permiso", 3]]) > 0);
  assert.equal(s([["permisos", 3]]), 0, "todas las palabras tienen que aparecer");
  assert.ok(scorer("#142")([["fix(ui): selector (#142, #143)", 3]]) > 0);
  assert.ok(scorer("oscu")([["feat: Modo Oscuro", 3]]) > 0);
  assert.equal(scorer("planilla")([["fix: plan", 3]]), 0);
  assert.ok(scorer("empleado")([["x", 1], ["empleados", 4]]) === 4, "toma el peso del mejor campo");
});
