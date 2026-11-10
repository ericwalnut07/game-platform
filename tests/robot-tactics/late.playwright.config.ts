import {defineConfig} from "@playwright/test";
import {robotLandscapeProjects} from "./landscapeProjects";
export default defineConfig({testDir:".",testMatch:"late-app.pw.ts",timeout:30000,workers:2,fullyParallel:false,use:{headless:true,launchOptions:process.env.ROBOT_BROWSER_EXECUTABLE?{executablePath:process.env.ROBOT_BROWSER_EXECUTABLE,args:["--no-sandbox"]}:{}},projects:robotLandscapeProjects,outputDir:"test-results/robot-late-browser"});
