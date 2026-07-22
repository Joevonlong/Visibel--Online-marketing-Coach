import path from "node:path";
import type { NextConfig } from "next";

// distDir is overridable via NEXT_DIST_DIR so a production `pnpm build`
// never writes into the same .next/ a live `pnpm dev` is using — see
// package.json's build/start/demo scripts, which set NEXT_DIST_DIR=.next-build.
// Without the override this stays the default ".next" for `pnpm dev`.
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
