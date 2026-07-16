import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output: `next build` emits a self-contained server bundle in
  // .next/standalone, so the Docker image ships without node_modules bloat.
  output: "standalone",
  // Pin the workspace root — a stray lockfile elsewhere on disk must never
  // make Turbopack re-root the project (breaks the RSC client manifest).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
