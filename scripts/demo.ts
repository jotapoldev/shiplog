// pnpm demo           crea repos de ejemplo en .demo/ y levanta la app sobre ellos (http://127.0.0.1:3211)
// pnpm demo --no-dev  solo crea los repos
//
// Los repos tienen develop/qa/uat/main, features que se mergean, un hotfix por cherry-pick y commits
// de otra persona. Cada uno tiene su "origin" (repo bare local), así la vista de ramas tiene qué comparar.
// La base y la memoria de la demo viven en .demo/, separadas de las tuyas.
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve(".demo");
const ROOT = join(DIR, "repos");
const PORT = 3211;
const DAY = 864e5;

type Who = { name: string; email: string };
const ME: Who = { name: "Demo", email: "demo@shiplog.dev" };
const ANA: Who = { name: "Ana López", email: "ana@example.com" };

// Pseudoaleatorio con semilla: la demo sale igual cada vez.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function git(cwd: string, args: string[], env: Record<string, string> = {}) {
  return execFileSync("git", args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

type Step =
  | { c: string; who?: Who } // commit en la rama actual
  | { on: string; from?: string } // cambiar de rama (y crearla desde `from`)
  | { merge: string; into: string } // merge --no-ff
  | { pick: string; into: string }; // cherry-pick del último commit cuyo asunto empieza con `pick`

function build(name: string, steps: Step[]) {
  const repo = join(ROOT, name);
  const remote = join(DIR, "remotes", `${name}.git`);
  mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.name", ME.name]);
  git(repo, ["config", "user.email", ME.email]);
  git(repo, ["config", "commit.gpgsign", "false"]);

  const commits = steps.filter((s) => "c" in s || "merge" in s).length;
  let t = Date.now() - 170 * DAY;
  const step = (169 * DAY) / commits;
  const tick = (who: Who) => {
    t += step * (0.4 + rand() * 1.2);
    // Horario de oficina: entre 8:00 y 19:00.
    const d = new Date(Math.min(t, Date.now() - 36e5));
    d.setHours(8 + Math.floor(rand() * 11), Math.floor(rand() * 60));
    const at = d.toISOString();
    return { GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_AUTHOR_DATE: at, GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email, GIT_COMMITTER_DATE: at };
  };

  let n = 0;
  for (const s of steps) {
    if ("c" in s) {
      appendFileSync(join(repo, `cambios-${n % 5}.md`), `${s.c}\n`);
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-q", "-m", s.c], tick(s.who ?? ME));
      n++;
    } else if ("on" in s) {
      git(repo, s.from ? ["checkout", "-q", "-b", s.on, s.from] : ["checkout", "-q", s.on]);
    } else if ("merge" in s) {
      git(repo, ["checkout", "-q", s.into]);
      git(repo, ["merge", "-q", "--no-ff", s.merge, "-m", `Merge branch '${s.merge}' into ${s.into}`], tick(ME));
    } else {
      const hash = git(repo, ["log", "--all", "--format=%H", "-1", "--fixed-strings", `--grep=${s.pick}`]).trim();
      git(repo, ["checkout", "-q", s.into]);
      // cherry-pick conserva fecha de autor y asunto: la app lo reconoce como el mismo cambio.
      git(repo, ["cherry-pick", "--allow-empty", "--keep-redundant-commits", "-X", "theirs", hash], { GIT_COMMITTER_DATE: new Date(Math.min(t, Date.now())).toISOString() });
    }
  }

  git(DIR, ["init", "-q", "--bare", remote]);
  git(repo, ["remote", "add", "origin", remote]);
  git(repo, ["push", "-q", "origin", "--all"]);
  git(repo, ["fetch", "-q", "origin"]);
  git(repo, ["checkout", "-q", "develop"]);
}

// Trabajo del día a día entre hito e hito, para que el heatmap tenga vida.
const DAILY = [
  "feat({s}): estado vacío con ilustración",
  "fix({s}): mensaje de error más claro",
  "refactor({s}): extraer hook de formulario",
  "chore: actualizar dependencias",
  "fix({s}): validar campos obligatorios",
  "feat({s}): filtros guardados en la URL",
  "test({s}): cubrir el caso sin resultados",
  "docs({s}): ejemplos en el README",
  "style({s}): alinear iconos y textos",
  "fix({s}): zona horaria en las fechas",
  "feat({s}): atajos de teclado",
  "perf({s}): paginar en el servidor",
];
let daily = 0;
const fill = (scope: string, n: number): Step[] =>
  Array.from({ length: n }, () => ({ c: DAILY[daily++ % DAILY.length].replace("{s}", scope), who: daily % 4 === 0 ? ANA : ME }));

// Una historia por repo: lo típico de gitflow, con algo pendiente de subir en cada ambiente.
const flow = (scope: string, feats: string[], fixes: string[], extra: Step[] = []): Step[] => [
  { c: "chore: proyecto inicial" },
  { on: "develop", from: "main" },
  { on: "qa", from: "main" },
  { on: "uat", from: "main" },
  { on: "develop" },
  { c: `feat(${scope}): ${feats[0]}` },
  ...fill(scope, 9),
  { c: `docs: guía para levantar el proyecto en local`, who: ANA },
  { on: `feature/${scope}-${feats[1].split(" ")[0]}`, from: "develop" },
  { c: `feat(${scope}): ${feats[1]}` },
  { c: `test(${scope}): casos para ${feats[1]}` },
  { c: `fix(${scope}): ${fixes[0]}` },
  { merge: `feature/${scope}-${feats[1].split(" ")[0]}`, into: "develop" },
  { merge: "develop", into: "qa" },
  { on: "develop" },
  { c: `refactor(${scope}): separar validaciones en su propio módulo` },
  ...fill(scope, 8),
  { c: `style(ui): espaciado consistente en tablas`, who: ANA },
  { merge: "qa", into: "uat" },
  { merge: "uat", into: "main" },
  { on: "main" },
  { c: `fix(${scope}): ${fixes[1]}` },
  { pick: fixes[1], into: "develop" },
  { pick: fixes[1], into: "uat" },
  { on: "develop" },
  { c: `perf(${scope}): cachear la consulta del listado` },
  ...fill(scope, 8),
  { c: `feat(${scope}): ${feats[2]}` },
  { merge: "develop", into: "qa" },
  { on: "develop" },
  { c: `ci: correr tests en cada push`, who: ANA },
  ...fill(scope, 6),
  { c: `feat(${scope}): ${feats[3]}` },
  { c: `fix(${scope}): ${fixes[2]}` },
  ...extra,
];

rmSync(DIR, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });

build(
  "tienda-web",
  flow(
    "carrito",
    ["agregar productos al carrito", "cupones de descuento", "guardar el carrito entre sesiones", "envío gratis desde cierto monto"],
    ["el total no sumaba el envío", "cupón vencido se aplicaba igual", "cantidad negativa en el carrito"],
    [{ on: "feature/carrito-wishlist", from: "develop" }, { c: "feat(carrito): lista de deseos" }, { on: "develop" }],
  ),
);
build(
  "api-pagos",
  flow(
    "pagos",
    ["cobro con tarjeta", "reembolsos parciales", "webhooks del banco", "reintentos con backoff"],
    ["doble cobro al reintentar", "moneda incorrecta en el recibo", "timeout del banco sin manejar"],
  ),
);
build(
  "panel-admin",
  flow(
    "usuarios",
    ["listado de usuarios con filtros", "roles y permisos", "exportar a Excel", "auditoría de cambios"],
    ["el filtro de fechas ignoraba el último día", "rol duplicado al guardar", "paginación saltaba registros"],
  ),
);

// Memoria de Claude Code de ejemplo para la vista Pendientes.
const mem = join(DIR, "memory");
mkdirSync(mem, { recursive: true });
writeFileSync(
  join(mem, "MEMORY.md"),
  [
    "- [Cupones: falta probar en uat](cupones-uat.md) — pendiente: validar cupones vencidos en uat antes de pasar a main",
    "- [Webhooks del banco](webhooks.md) — sin commitear: reintentos con backoff en api-pagos",
  ].join("\n") + "\n",
);
writeFileSync(join(mem, "cupones-uat.md"), "---\nname: cupones-uat\nmetadata:\n  type: project\n---\n\nPendiente probar en uat el fix de cupones vencidos de tienda-web.\n");
writeFileSync(join(mem, "webhooks.md"), "---\nname: webhooks\nmetadata:\n  type: project\n---\n\nCambios sin commitear en api-pagos: reintentos con backoff para los webhooks del banco.\n");

console.log(`Repos de ejemplo listos en ${ROOT}`);

if (!process.argv.includes("--no-dev")) {
  console.log(`Abriendo la demo en http://127.0.0.1:${PORT}`);
  const next = join("node_modules", "next", "dist", "bin", "next");
  spawn(process.execPath, [next, "dev", "-H", "127.0.0.1", "-p", String(PORT)], {
    stdio: "inherit",
    env: { ...process.env, SHIPLOG_ROOT: ROOT, SHIPLOG_DATA: join(DIR, "data"), SHIPLOG_MEMORY_DIR: mem, SHIPLOG_DIST: ".demo/next" },
  });
}
