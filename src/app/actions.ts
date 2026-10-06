"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { commits, getDb, notes, repos, tasks, type TaskStatus } from "@/lib/db";
import { addRepoPath, removeRepoPath, syncRepos } from "@/lib/sync";
import { autoLink, createTask, linkCommits, setTaskStatus } from "@/lib/tasks";
import { READONLY, READONLY_MSG } from "@/lib/config";

export async function sync() {
  if (READONLY) return { added: 0, errors: [READONLY_MSG] };
  const res = await syncRepos();
  revalidatePath("/");
  return res;
}

export async function saveNote(day: string, body: string) {
  if (READONLY) return;
  const db = await getDb();
  if (!body.trim()) await db.delete(notes).where(eq(notes.day, day));
  else await db.insert(notes).values({ day, body }).onConflictDoUpdate({ target: notes.day, set: { body } });
  revalidatePath("/");
}

export async function addTask(input: { title: string; status?: TaskStatus }) {
  if (READONLY) return READONLY_MSG;
  const res = await createTask(input);
  revalidatePath("/");
  return "error" in res ? res.error : null;
}

export async function moveTask(id: number, status: TaskStatus) {
  if (READONLY) return READONLY_MSG;
  const res = await setTaskStatus(id, status);
  revalidatePath("/");
  return "error" in res ? res.error : null;
}

export async function setKeywords(id: number, keywords: string) {
  if (READONLY) return;
  await (await getDb()).update(tasks).set({ keywords: keywords.trim() || null }).where(eq(tasks.id, id));
  await autoLink();
  revalidatePath("/");
}

export async function deleteTask(id: number) {
  if (READONLY) return;
  await (await getDb()).delete(tasks).where(eq(tasks.id, id));
  revalidatePath("/");
}

export async function commitsOfDay(day: string) {
  return (await getDb()).select().from(commits).where(eq(commits.day, day)).orderBy(desc(commits.authoredAt));
}

export async function toggleCommit(taskId: number, commitId: string, on: boolean) {
  if (READONLY) return;
  await linkCommits(taskId, [commitId], on);
  revalidatePath("/");
}

export async function addRepo(path: string) {
  if (READONLY) return { error: READONLY_MSG };
  const res = await addRepoPath(path);
  revalidatePath("/");
  return res;
}

export async function removeRepo(path: string) {
  if (READONLY) return;
  await removeRepoPath(path);
  revalidatePath("/");
}

/** Ramas que sigue un repo, en orden de ambiente. null = volver a las por defecto. Resincroniza el repo para recalcular dónde está cada commit. */
export async function setTrackedBranches(path: string, branches: string[] | null) {
  if (READONLY) return READONLY_MSG;
  if (branches && !branches.length) return "Elige al menos una rama.";
  if (branches?.some((b) => typeof b !== "string" || !/^[\w./-]+$/.test(b))) return "Nombre de rama no válido.";
  await (await getDb()).update(repos).set({ branches: branches?.join(",") ?? null }).where(eq(repos.path, path));
  const res = await syncRepos(path);
  revalidatePath("/");
  revalidatePath("/ramas");
  return res.errors[0] ?? null;
}
