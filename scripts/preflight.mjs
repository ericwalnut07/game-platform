import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];
const required = [
  "package.json",
  "wrangler.jsonc",
  "src/server/worker.ts",
  "src/server/durable-objects/RoomObject.ts",
  "migrations/0001_rooms.sql",
  "migrations/0002_playtest.sql",
  "migrations/0003_playtest_feedback.sql",
  "migrations/0004_playtest_analytics.sql",
  "migrations/0005_operations.sql"
];

for (const file of required) {
  if (!existsSync(resolve(root, file))) failures.push(`missing: ${file}`);
}

const major = Number(process.versions.node.split(".")[0]);
if (major < 24) failures.push(`Node.js 24+ required; current=${process.versions.node}`);

if (!existsSync(resolve(root, "package-lock.json"))) {
  warnings.push("package-lock.json is not present yet. Run npm install once and commit the generated lockfile.");
}

if (existsSync(resolve(root, "wrangler.jsonc"))) {
  const wrangler = readFileSync(resolve(root, "wrangler.jsonc"), "utf8");
  if (!wrangler.includes('"ROOMS"')) failures.push("wrangler.jsonc is missing the ROOMS Durable Object binding");
  if (!wrangler.includes('"crons"')) warnings.push("Daily maintenance cron is not configured.");
  if (!wrangler.includes('"d1_databases"')) warnings.push("D1 binding is not configured. Games still run, but room directory/playtest analytics will be disabled.");
}

if (!existsSync(resolve(root, ".dev.vars"))) {
  warnings.push(".dev.vars is absent. Owner-only analytics/operations will remain disabled locally until ANALYTICS_TOKEN and ADMIN_TOKEN are configured.");
}

for (const message of warnings) console.warn(`WARN  ${message}`);
if (failures.length) {
  for (const message of failures) console.error(`ERROR ${message}`);
  process.exit(1);
}
console.log("Preflight passed.");
