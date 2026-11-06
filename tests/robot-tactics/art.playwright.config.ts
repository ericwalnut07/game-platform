import {defineConfig} from "@playwright/test";
import {robotLandscapeProjects} from "./landscapeProjects";
export default defineConfig({testDir:".",testMatch:["art-ui.pw.ts","art-production.pw.ts"],fullyParallel:true,timeout:60000,use:{headless:true},projects:robotLandscapeProjects,outputDir:"test-results/robot-art-browser"});
