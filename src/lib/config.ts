import { resolve } from "node:path";

// Se configura con .env.local (ver .env.example). Next lo carga solo; los scripts lo leen con --env-file-if-exists.

/** Carpeta donde se buscan los repos, a cualquier profundidad. Por defecto, la carpeta que contiene la app. */
export const ROOT = resolve(process.env.SHIPLOG_ROOT || "..");

/** En Docker: la ruta de ROOT en el host, para traducir las rutas que manda `curl`/`pnpm sync` desde fuera del contenedor. */
export const HOST_ROOT = process.env.SHIPLOG_HOST_ROOT || "";

/** Demo pública: con SHIPLOG_READONLY=1 nada se escribe; los cambios se rechazan con este mensaje. */
export const READONLY = process.env.SHIPLOG_READONLY === "1";
export const READONLY_MSG = "Esta es una demo de solo lectura con datos de ejemplo. Instalá Shiplog para usarlo con tus repos.";

/** Dónde vive la base PGlite. */
export const DATA_DIR = resolve(process.env.SHIPLOG_DATA || "./data");
