// pnpm sync [ruta-del-repo]
// pnpm task "título" [--repo mi-repo] [--note "detalle"] [--keywords "modo oscuro, #142"] [--status doing]
// pnpm task:status <id> <pending|doing|done>
//
// Con la app corriendo, delega en su API: el servidor es el único que abre ./data.
// Si nadie escucha en el puerto, abre PGlite directo. Nunca abre la DB con el servidor vivo,
// porque PGlite no admite dos procesos sobre el mismo directorio.
export {};

const [cmd, ...args] = process.argv.slice(2);
const base = `http://127.0.0.1:${process.env.PORT ?? 3210}`;

function flag(name: string) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
}

/** Llama a la app; null si no está corriendo. */
async function post(path: string, body?: unknown, method = "POST") {
  try {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    return { status: res.status, data: await res.json() };
  } catch (e) {
    if ((e as { cause?: { code?: string } }).cause?.code === "ECONNREFUSED") return null;
    throw e;
  }
}

async function closeDb() {
  const { getDb } = await import("../src/lib/db.ts");
  await (await getDb()).$client.close();
}

if (cmd === "sync") {
  const repo = args[0];
  const viaServer = await post(`/api/sync${repo ? `?repo=${encodeURIComponent(repo)}` : ""}`);
  let res: { added: number; errors: string[] };
  if (viaServer) res = viaServer.data;
  else {
    const { syncRepos } = await import("../src/lib/sync.ts");
    res = await syncRepos(repo);
    await closeDb();
  }
  console.log(`shiplog (${viaServer ? "servidor" : "directo"}): ${res.added} commits nuevos`);
  for (const e of res.errors) console.error(`  ${e}`);
  process.exitCode = res.errors.length && !res.added ? 1 : 0;
} else if (cmd === "task") {
  const extra = Object.fromEntries(["repo", "note", "keywords", "status"].map((k) => [k, flag(k)]).filter(([, v]) => v));
  const body = { title: args.join(" "), ...extra };
  const viaServer = await post("/api/tasks", body);
  let res: { error?: string; task?: { id: number; title: string } };
  if (viaServer) res = viaServer.data;
  else {
    const { createTask } = await import("../src/lib/tasks.ts");
    res = await createTask(body);
    await closeDb();
  }
  if (res.error) {
    console.error(`shiplog: ${res.error}`);
    process.exitCode = 1;
  } else console.log(`shiplog (${viaServer ? "servidor" : "directo"}): tarea #${res.task!.id} "${res.task!.title}"`);
} else if (cmd === "status") {
  const [id, status] = args;
  const viaServer = await post(`/api/tasks/${encodeURIComponent(id ?? "")}`, { status }, "PATCH");
  let res: { error?: string; task?: { id: number; title: string; status: string } };
  if (viaServer) res = viaServer.data;
  else {
    const { setTaskStatus } = await import("../src/lib/tasks.ts");
    res = Number.isInteger(Number(id)) ? await setTaskStatus(Number(id), status) : { error: "Uso: pnpm task:status <id> <pending|doing|done>" };
    await closeDb();
  }
  if (res.error) {
    console.error(`shiplog: ${res.error}`);
    process.exitCode = 1;
  } else console.log(`shiplog (${viaServer ? "servidor" : "directo"}): tarea #${res.task!.id} -> ${res.task!.status}`);
} else {
  console.error('Uso: pnpm sync [ruta-del-repo]  |  pnpm task "título" [--repo r] [--note n] [--keywords k] [--status s]  |  pnpm task:status <id> <estado>');
  process.exitCode = 1;
}
