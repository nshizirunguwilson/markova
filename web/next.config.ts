import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Emit a self-contained server bundle so the Docker image does not need to
  // ship node_modules. See web/Dockerfile.
  output: "standalone",
  serverExternalPackages: ["jspdf", "jspdf-autotable", "xlsx"],
};

export default nextConfig;
