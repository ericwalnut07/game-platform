import {defineConfig} from "@playwright/test";
import {robotLandscapeProjects} from "./landscapeProjects";
export default defineConfig({testDir:".",testMatch:"late-app.pw.ts",timeout:120000,fullyParallel:true,use:{headless:true,launchOptions:process.env.ROBOT_BROWSER_EXECUTABLE?{executablePath:process.env.ROBOT_BROWSER_EXECUTABLE,args:["--no-sandbox"]}:{}},projects:robotLandscapeProjects,outputDir:"test-results/robot-late-browser"});
