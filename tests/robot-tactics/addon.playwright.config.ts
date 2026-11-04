import { defineConfig } from "@playwright/test";
import { robotLandscapeProjects } from "./landscapeProjects";
export default defineConfig({ testDir: ".", testMatch: "addon-blast.pw.ts", fullyParallel: true, use: { headless: true }, projects: robotLandscapeProjects, outputDir: "test-results/robot-addon-browser" });
