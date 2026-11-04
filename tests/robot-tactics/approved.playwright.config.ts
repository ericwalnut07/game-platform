import { defineConfig } from "@playwright/test";
import { robotLandscapeProjects } from "./landscapeProjects";
export default defineConfig({ testDir: ".", testMatch: "approved-app.pw.ts", timeout: 120000, fullyParallel: true, use: { headless: true }, projects: robotLandscapeProjects, outputDir: "test-results/robot-approved-browser" });
