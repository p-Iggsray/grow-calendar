// Flat config (ESLint 9). Four layers:
// 1. Service worker (public/sw.js) — script context, browser + worker globals.
// 2. Base JS rules + globals for browser code in src/.
// 3. Worker code in worker/ runs on Cloudflare Workers - browser-ish globals
//    (crypto, fetch, Response, URL) but no DOM.
// 4. Test/script files in test/ and scripts/ run on Node, so Node globals.

import js from "@eslint/js";
import globals from "globals";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", "node_modules/**", ".wrangler/**"] },

  js.configs.recommended,

  // Service worker — script context with browser + worker globals (self, caches, clients, etc.)
  {
    files: ["public/sw.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.worker,
        clients: "readonly", // ServiceWorkerGlobalScope.clients — not in standard globals sets
      },
    },
  },

  // Frontend (React)
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: { react: reactPlugin, "react-hooks": reactHooksPlugin },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    settings: { react: { version: "18" } },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",       // automatic JSX runtime
      "react/prop-types": "off",                // no PropTypes in this project
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // Worker (Cloudflare). No DOM. Has fetch, crypto, btoa/atob, URL, Response.
  {
    files: ["worker/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.worker,
        // Cloudflare-specific runtime bindings come in via env/ctx, not globals.
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // Tests + scripts (Node)
  {
    files: ["test/**/*.js", "scripts/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];
