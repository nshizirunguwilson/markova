import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ["jspdf", "jspdf-autotable", "xlsx"],
};

export default nextConfig;
