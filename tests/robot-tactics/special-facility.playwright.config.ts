import { defineConfig } from "@playwright/test";
import { robotLandscapeProjects } from "./landscapeProjects";

export default defineConfig({
  testDir: ".",
  testMatch: "special-facility-ui.pw.ts",
  fullyParallel: true,
  timeout: 60000,
  use: { headless: true },
  projects: robotLandscapeProjects,
  outputDir: "test-results/robot-special-facility-ui",
});
