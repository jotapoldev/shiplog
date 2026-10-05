"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { commits, getDb, memoryState, notes, tasks, type TaskStatus } from "@/lib/db";
import { addRepoPath, removeRepoPath, syncRepos } from "@/lib/sync";
import { autoLink, createTask, linkCommits, setTaskStatus } from "@/lib/tasks";

export async function sync() {
  const res = await syncRepos();
  revalidatePath("/");
  return res;
}

export async function saveNote(day: string, body: string) {
  const db = await getDb();
  if (!body.trim()) await db.delete(notes).where(eq(notes.day, day));
  else await db.insert(notes).values({ day, body }).onConflictDoUpdate({ target: notes.day, set: { body } });
  revalidatePath("/");
}

export async function addTask({ memoryHash, ...input }: { title: string; memoryFile?: string; memoryHash?: string; status?: TaskStatus }) {
  const res = await createTask(input);
  // La memoria pasa a vivir como tarea; si el archivo cambia luego, la tarjeta vuelve como "Actualizada".
  if (!("error" in res) && input.memoryFile && memoryHash)
    await (await getDb())
      .insert(memoryState)
      .values({ file: input.memoryFile, status: "tracked", hash: memoryHash })
      .onConflictDoUpdate({ target: memoryState.file, set: { status: "tracked", hash: memoryHash } });
  revalidatePath("/");
  return "error" in res ? res.error : null;
}

export async function moveTask(id: number, status: TaskStatus) {
  const res = await setTaskStatus(id, status);
  revalidatePath("/");
  return "error" in res ? res.error : null;
}

export async function setKeywords(id: number, keywords: string) {
  await (await getDb()).update(tasks).set({ keywords: keywords.trim() || null }).where(eq(tasks.id, id));
  await autoLink();
  revalidatePath("/");
}

export async function deleteTask(id: number) {
  await (await getDb()).delete(tasks).where(eq(tasks.id, id));
  revalidatePath("/");
}

export async function commitsOfDay(day: string) {
  return (await getDb()).select().from(commits).where(eq(commits.day, day)).orderBy(desc(commits.authoredAt));
}

export async function toggleCommit(taskId: number, commitId: string, on: boolean) {
  await linkCommits(taskId, [commitId], on);
  revalidatePath("/");
}

/** Ocultar guarda el hash visto: si la memoria cambia, la tarjeta vuelve. hash vacío = restaurar. */
export async function hideMemory(file: string, hash: string) {
  const db = await getDb();
  if (!hash) await db.delete(memoryState).where(eq(memoryState.file, file));
  else await db.insert(memoryState).values({ file, status: "hidden", hash }).onConflictDoUpdate({ target: memoryState.file, set: { status: "hidden", hash } });
  revalidatePath("/");
}

/** La memoria de una tarea cambió y el usuario ya la vio: se guarda el hash nuevo sin tocar la tarea. */
export async function ackMemory(file: string, hash: string) {
  await (await getDb()).update(memoryState).set({ hash }).where(eq(memoryState.file, file));
  revalidatePath("/");
}

export async function addRepo(path: string) {
  const res = await addRepoPath(path);
  revalidatePath("/");
  return res;
}

export async function removeRepo(path: string) {
  await removeRepoPath(path);
  revalidatePath("/");
}
