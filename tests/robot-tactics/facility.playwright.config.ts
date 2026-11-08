import { defineConfig } from "@playwright/test";
import { robotLandscapeProjects } from "./landscapeProjects";

export default defineConfig({
  testDir: ".", testMatch: "facility-app.pw.ts",
  timeout: 60000, fullyParallel: true, workers: 2,
  use: { headless: true }, projects: robotLandscapeProjects,
  outputDir: "test-results/robot-facility-browser",
});
