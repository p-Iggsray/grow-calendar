import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
