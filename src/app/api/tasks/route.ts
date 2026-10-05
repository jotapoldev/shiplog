import { revalidatePath } from "next/cache";
import { createTask } from "@/lib/tasks";

// POST /api/tasks  { "title": "...", "repo"?, "note"?, "keywords"?: "modo oscuro, #142", "status"?: "pending" | "doing" | "done" }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 });
  const res = await createTask(body);
  if ("error" in res) return Response.json(res, { status: 400 });
  revalidatePath("/");
  return Response.json(res, { status: 201 });
}
