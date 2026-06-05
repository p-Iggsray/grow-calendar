import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

// Stamp a unique build ID into sw.js on every production build so the old
// service worker's activate handler deletes the stale cache and the new one
// takes over with fresh assets.
function stampSwVersion() {
  return {
    name: "stamp-sw-version",
    closeBundle() {
      const swPath = path.resolve("dist/sw.js");
      if (!fs.existsSync(swPath)) return;
      const buildId = Date.now().toString(36);
      const updated = fs.readFileSync(swPath, "utf-8")
        .replace("grow-calendar-v1", `grow-calendar-${buildId}`);
      fs.writeFileSync(swPath, updated);
    },
  };
}

export default defineConfig({
  plugins: [react(), stampSwVersion()],
  server: {
    open: true,
    host: true,
    // Forward API calls to the local Worker (run `npx wrangler dev` alongside).
    // Without this, /api/* hits the Vite dev server and 404s.
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
