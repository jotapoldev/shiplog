import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, tasks } from "@/lib/db";
import { setTaskStatus } from "@/lib/tasks";
import { READONLY, READONLY_MSG } from "@/lib/config";

const badId = () => Response.json({ error: "El id debe ser un número entero, por ejemplo /api/tasks/12." }, { status: 400 });

// PATCH /api/tasks/:id  { "status": "pending" | "doing" | "done" }
export async function PATCH(req: Request, { params }: RouteContext<"/api/tasks/[id]">) {
  if (READONLY) return Response.json({ error: READONLY_MSG }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return badId();
  const body = await req.json().catch(() => null);
  const res = await setTaskStatus(id, body?.status);
  if ("error" in res) return Response.json(res, { status: res.error.startsWith("No existe") ? 404 : 400 });
  revalidatePath("/");
  return Response.json(res);
}

// DELETE /api/tasks/:id
export async function DELETE(_req: Request, { params }: RouteContext<"/api/tasks/[id]">) {
  if (READONLY) return Response.json({ error: READONLY_MSG }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return badId();
  const gone = await (await getDb()).delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id });
  if (!gone.length) return Response.json({ error: `No existe la tarea #${id}.` }, { status: 404 });
  revalidatePath("/");
  return Response.json({ deleted: id });
}
