import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  // La demo usa su propia carpeta de build para poder correr junto a la app real.
  ...(process.env.SHIPLOG_DIST && { distDir: process.env.SHIPLOG_DIST }),
};

export default nextConfig;
