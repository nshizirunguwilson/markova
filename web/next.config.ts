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
  /*
    xlsx is gone, replaced by exceljs. Both are heavy libraries loaded on
    demand for an export, so neither belongs in the server bundle.
  */
  serverExternalPackages: ["jspdf", "jspdf-autotable", "exceljs"],
  typescript: {
    /*
      The build typechecks the application, not the tests.

      Two tests deliberately import from outside web/ - the theme test reads
      design/tokens.json to prove the stylesheet and the token file agree, and
      the share test reads scripts/share.mjs. Both are right to do so. But the
      Docker image only copies web/, so those imports do not resolve there and
      the production build failed on files it does not ship.

      `npm run typecheck` and CI still check everything, including the tests.
    */
    tsconfigPath: "tsconfig.build.json",
  },
};

export default nextConfig;
