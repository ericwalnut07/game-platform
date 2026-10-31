import { defineConfig } from "vite";
import { resolve } from "node:path";
import { robotOfflineInlineBuild } from "../../apps/robot-tactics/inlineBuild";
export default defineConfig({ root: resolve(process.cwd(), "tests/robot-tactics/weapon-fixture"), base: "./", plugins: [robotOfflineInlineBuild()], build: { target: "es2022", outDir: resolve(process.cwd(), "test-results/robot-weapon-fixture"), emptyOutDir: true, modulePreload: false, cssCodeSplit: false, rollupOptions: { output: { inlineDynamicImports: true } } } });
