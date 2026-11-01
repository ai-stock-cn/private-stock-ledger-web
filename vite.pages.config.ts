import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(projectRoot, "github-pages"),
  base: "/private-stock-ledger-web/",
  publicDir: path.join(projectRoot, "public"),
  plugins: [react()],
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
  build: {
    outDir: path.join(projectRoot, "pages-dist"),
    emptyOutDir: true,
  },
});
