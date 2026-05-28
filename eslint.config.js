// Flat config (ESLint 9). Three layers:
// 1. Base JS rules + globals for browser code in src/.
// 2. Worker code in worker/ runs on Cloudflare Workers - browser-ish globals
//    (crypto, fetch, Response, URL) but no DOM.
// 3. Test/script files in test/ and scripts/ run on Node, so Node globals.

import js from "@eslint/js";
import globals from "globals";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", "node_modules/**", ".wrangler/**"] },

  js.configs.recommended,

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
