import { defineConfig } from "vitest/config";
// Unit tests mock cloudflare:workers; do not boot Vite's dev worker/R2 bindings.
export default defineConfig({ test: { include: ["tests/unit/**/*.test.ts"] } });
