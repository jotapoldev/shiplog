import { revalidatePath } from "next/cache";
import { syncRepos } from "@/lib/sync";
import { READONLY, READONLY_MSG } from "@/lib/config";

// POST /api/sync                      -> todos los repos registrados
// POST /api/sync?repo=<ruta absoluta>  -> solo ese (se registra si está dentro de SHIPLOG_ROOT)
export async function POST(req: Request) {
  if (READONLY) return Response.json({ error: READONLY_MSG }, { status: 403 });
  const res = await syncRepos(new URL(req.url).searchParams.get("repo") ?? undefined);
  revalidatePath("/");
  return Response.json(res, { status: res.errors.length && !res.added ? 422 : 200 });
}
