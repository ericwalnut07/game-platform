import {defineConfig} from "@playwright/test";
import {robotLandscapeProjects} from "./landscapeProjects";
export default defineConfig({testDir:".",testMatch:"early-app.pw.ts",timeout:180000,fullyParallel:true,use:{headless:true},projects:robotLandscapeProjects,outputDir:"test-results/robot-early-browser"});
