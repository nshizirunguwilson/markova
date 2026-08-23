import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // A build normally writes to `.next`, which a running dev server owns.
  // NEXT_DIST_DIR sends a verification build somewhere else instead of
  // overwriting the directory somebody is developing against.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Emit a self-contained server bundle so the Docker image does not need to
  // ship node_modules. See web/Dockerfile.
  output: "standalone",
  serverExternalPackages: ["jspdf", "jspdf-autotable", "xlsx"],
};

export default nextConfig;
