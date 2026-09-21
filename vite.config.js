import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { prepaintCss, prepaintHtml } from "./src/lib/splashPrepaint.js";

// Put the opening into index.html itself, so the brand is on screen in the
// document's own first paint rather than waiting on the bundle. Injected
// rather than written by hand because the mark is generated from the shared
// geometry in src/lib/catMark.js, and a hand-copied cat is a cat that drifts.
//
// Runs in dev and in build, so what is developed against is what ships.
function prepaintSplash() {
  return {
    name: "prepaint-splash",
    transformIndexHtml(html) {
      return html
        .replace("/* prepaint-css */", prepaintCss())
        .replace("<!-- prepaint -->", prepaintHtml());
    },
  };
}

// Stamp a unique build ID into sw.js and inject the critical JS/CSS asset URLs
// so they are pre-cached during SW install. Pre-caching ensures the app shell
// is served entirely from cache after a SW update — no network round-trip
// required for the JS/CSS bundles, which eliminates the blank-screen race where
// the new SW takes over before those assets are fetched.
function stampSwVersion() {
  return {
    name: "stamp-sw-version",
    closeBundle() {
      const swPath  = path.resolve("dist/sw.js");
      const htmlPath = path.resolve("dist/index.html");
      if (!fs.existsSync(swPath)) return;

      const buildId = Date.now().toString(36);

      // Extract the JS/CSS bundle URLs that index.html references directly.
      // Lazy-loaded chunks are intentionally excluded — they are fetched on
      // demand and cached at runtime when the user first visits that feature.
      let criticalAssets = [];
      if (fs.existsSync(htmlPath)) {
        const html = fs.readFileSync(htmlPath, "utf-8");
        const scripts = [...html.matchAll(/\bsrc="(\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
        const styles  = [...html.matchAll(/\bhref="(\/assets\/[^"]+\.css)"/g)].map(m => m[1]);
        criticalAssets = [...scripts, ...styles];
      }

      const shellUrls = ["/", "/index.html", "/manifest.webmanifest", ...criticalAssets];
      const urlList   = shellUrls.map(u => JSON.stringify(u)).join(", ");

      const updated = fs.readFileSync(swPath, "utf-8")
        .replace(/grow-calendar-v\d+/, `grow-calendar-${buildId}`)
        .replace(
          /c\.addAll\(\[[\s\S]*?\]\)/,
          `c.addAll([${urlList}])`
        );

      fs.writeFileSync(swPath, updated);
    },
  };
}

export default defineConfig({
  plugins: [react(), prepaintSplash(), stampSwVersion()],
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
