import {defineConfig} from "@playwright/test";
import {robotLandscapeProjects} from "./landscapeProjects";
export default defineConfig({testDir:".",testMatch:"art-portrait.pw.ts",fullyParallel:true,use:{headless:true},projects:robotLandscapeProjects,outputDir:"test-results/robot-art-portrait-browser"});
