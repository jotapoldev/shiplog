import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// config.ts lee el entorno al importarse: se fija antes del import dinámico.
const root = mkdtempSync(join(tmpdir(), "shiplog-"));
process.env.SHIPLOG_ROOT = root;
process.env.SHIPLOG_HOST_ROOT = "C:\\Users\\yo\\code\\";
const { discoverRepos, toLocalPath } = await import("./git.ts");

const dir = (...p: string[]) => mkdirSync(join(root, ...p), { recursive: true });

test("discoverRepos: encuentra repos anidados y salta worktrees, ocultas y dependencias", () => {
  dir("api", ".git");
  dir("clientes", "pnc", "capih", ".git");
  dir("clientes", "pnc", "capih", "sub", ".git"); // dentro de un repo: no se entra
  dir("web", "node_modules", "lib", ".git");
  dir(".cache", "x", ".git");
  dir("wt");
  writeFileSync(join(root, "wt", ".git"), "gitdir: ../api/.git/worktrees/wt");
  assert.deepEqual(discoverRepos().sort(), [join(root, "api"), join(root, "clientes", "pnc", "capih")].sort());
});

test("toLocalPath: traduce rutas del host al contenedor", () => {
  assert.equal(toLocalPath("C:/Users/yo/code/clientes/capih"), `${root}/clientes/capih`);
  assert.equal(toLocalPath("c:\\users\\yo\\code\\api"), `${root}/api`);
  assert.equal(toLocalPath("C:/Users/yo/codex/api"), "C:/Users/yo/codex/api"); // prefijo parecido, otra carpeta
  assert.equal(toLocalPath("D:/otro"), "D:/otro");
});
