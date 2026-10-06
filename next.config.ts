import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

const { version } = JSON.parse(readFileSync("./package.json", "utf8"));

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  // Versión de package.json (la sube `pnpm release`), visible en el pie de la app.
  env: { SHIPLOG_VERSION: version },
  // La demo usa su propia carpeta de build para poder correr junto a la app real.
  ...(process.env.SHIPLOG_DIST && { distDir: process.env.SHIPLOG_DIST }),
};

export default nextConfig;
