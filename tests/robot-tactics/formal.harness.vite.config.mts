import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({ build: { target: "es2022", outDir: resolve(process.cwd(), "test-results/robot-formal-harness"), emptyOutDir: true, minify: false, lib: { entry: resolve(process.cwd(), "tests/robot-tactics/formalHarness.ts"), formats: ["cjs"], fileName: () => "controller.cjs" } } });
