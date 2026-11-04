import { defineConfig } from "@playwright/test";
import { robotLandscapeProjects } from "./landscapeProjects";
export default defineConfig({testDir:".",testMatch:"m02-app.pw.ts",timeout:120000,fullyParallel:true,use:{headless:true},projects:robotLandscapeProjects,outputDir:"test-results/robot-m02-browser"});
