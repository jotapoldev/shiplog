import { homedir } from "node:os";
import { join, resolve } from "node:path";

// Se configura con .env.local (ver .env.example). Next lo carga solo; los scripts lo leen con --env-file-if-exists.

/** Carpeta cuyos repos de primer nivel cuentan. Por defecto, la carpeta que contiene la app. */
export const ROOT = resolve(process.env.SHIPLOG_ROOT || "..");

/** Memoria de Claude Code del proyecto abierto en ROOT (solo lectura). Claude Code nombra la carpeta con la ruta, cambiando todo lo que no es letra o número por "-". */
export const MEMORY_DIR = process.env.SHIPLOG_MEMORY_DIR || join(homedir(), ".claude", "projects", ROOT.replace(/[^a-zA-Z0-9]/g, "-"), "memory");

/** Dónde vive la base PGlite. */
export const DATA_DIR = resolve(process.env.SHIPLOG_DATA || "./data");
