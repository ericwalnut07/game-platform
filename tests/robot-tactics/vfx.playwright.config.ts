import { robotLandscapeProjects } from "./landscapeProjects";
import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: ".", testMatch: "battle-ui.pw.ts", grep: /replaceable|raster/, fullyParallel: true, use: { headless: true }, projects: robotLandscapeProjects, outputDir: "test-results/robot-vfx-browser" });
