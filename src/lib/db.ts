import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { boolean, index, integer, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";
import { DATA_DIR } from "./config.ts";
// ignored = el usuario lo quitó; el descubrimiento automático no lo vuelve a agregar.
// branches = ramas que sigue, en orden de ambiente ("develop,qa,main"); null = las por defecto (BRANCHES).
export const repos = pgTable("repos", { path: text().primaryKey(), ignored: boolean().notNull().default(false), branches: text() });

// id = repo|fecha de autor|subject: un cherry-pick a qa/uat/main colapsa en la misma fila.
export const commits = pgTable(
  "commits",
  {
    id: text().primaryKey(),
    hash: text().notNull(),
    repo: text().notNull(),
    authoredAt: text("authored_at").notNull(),
    day: text().notNull(),
    type: text().notNull(),
    scope: text(),
    subject: text().notNull(),
    body: text(),
    /** Ramas remotas que lo contienen, "develop,qa,main"; vacío = solo local. */
    branches: text(),
  },
  (t) => [index("commits_day_idx").on(t.day)],
);

export const notes = pgTable("notes", { day: text().primaryKey(), body: text().notNull() });

export const TASK_STATUS = ["pending", "doing", "done"] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

// ponytail: el ciclo de vida guarda la última fecha de cada estado (no un log de eventos);
// si hace falta auditar idas y vueltas, agregar una tabla task_events.
export const tasks = pgTable("tasks", {
  id: serial().primaryKey(),
  title: text().notNull(),
  repo: text(),
  note: text(),
  keywords: text(),
  status: text().$type<TaskStatus>().notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  doneAt: timestamp("done_at", { withTimezone: true }),
});

export const taskCommits = pgTable(
  "task_commits",
  {
    taskId: integer("task_id").notNull(),
    commitId: text("commit_id").notNull(),
    source: text().$type<"auto" | "manual" | "excluded">().notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.commitId] })],
);

// ponytail: PGlite embebido (Postgres en WASM, datos en ./data). Para Postgres real:
// cambiar a drizzle-orm/postgres-js + DATABASE_URL; el esquema y las queries no cambian.
async function open() {
  mkdirSync(DATA_DIR, { recursive: true });
  const client = new PGlite(join(DATA_DIR, "pg"));
  await client.exec(`
    CREATE TABLE IF NOT EXISTS repos (path text PRIMARY KEY);
    ALTER TABLE repos ADD COLUMN IF NOT EXISTS ignored boolean NOT NULL DEFAULT false;
    ALTER TABLE repos ADD COLUMN IF NOT EXISTS branches text;
    CREATE TABLE IF NOT EXISTS commits (
      id text PRIMARY KEY, hash text NOT NULL, repo text NOT NULL, authored_at text NOT NULL,
      day text NOT NULL, type text NOT NULL, scope text, subject text NOT NULL
    );
    ALTER TABLE commits ADD COLUMN IF NOT EXISTS body text;
    ALTER TABLE commits ADD COLUMN IF NOT EXISTS branches text;
    CREATE INDEX IF NOT EXISTS commits_day_idx ON commits (day);
    CREATE TABLE IF NOT EXISTS notes (day text PRIMARY KEY, body text NOT NULL);
    CREATE TABLE IF NOT EXISTS tasks (
      id serial PRIMARY KEY, title text NOT NULL, repo text, note text, keywords text,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'doing', 'done')),
      created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, done_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS task_commits (
      task_id integer NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      commit_id text NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
      source text NOT NULL, PRIMARY KEY (task_id, commit_id)
    );
    -- La integración con la memoria de Claude Code se quitó.
    DROP TABLE IF EXISTS memory_state;
    ALTER TABLE tasks DROP COLUMN IF EXISTS memory_file;
    -- ci/build antes caían en "other"; se reclasifican una vez (idempotente).
    UPDATE commits SET type = lower(substring(split_part(id, '|', 3) from '(?i)^(ci|build)'))
      WHERE type = 'other' AND split_part(id, '|', 3) ~* '^(ci|build)[(!:]';
  `);
  const db = drizzle({ client });
  return db;
}

const g = globalThis as unknown as { __db?: ReturnType<typeof open> };
export const getDb = () =>
  (g.__db ??= open().catch((e) => {
    g.__db = undefined;
    throw e;
  }));
