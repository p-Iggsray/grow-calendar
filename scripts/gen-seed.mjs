// Generates seed/seed-plan-config.sql from DEFAULT_CONFIG so the seed never
// drifts from the source of truth. INSERT OR IGNORE keeps it idempotent.
import { writeFileSync, mkdirSync } from "node:fs";
import { DEFAULT_CONFIG } from "../src/lib/planConfig.js";

const json = JSON.stringify(DEFAULT_CONFIG);          // ISO dates only, no quotes to escape
const now = new Date().toISOString();
const sql =
  `INSERT OR IGNORE INTO plan_config (id, config, updated_at)\n` +
  `VALUES (1, '${json}', '${now}');\n`;

mkdirSync(new URL("../seed/", import.meta.url), { recursive: true });
writeFileSync(new URL("../seed/seed-plan-config.sql", import.meta.url), sql);
console.log("wrote seed/seed-plan-config.sql");
