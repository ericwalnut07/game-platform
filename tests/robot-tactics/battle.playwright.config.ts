import { robotLandscapeProjects } from "./landscapeProjects";
import { defineConfig } from "@playwright/test";
export default defineConfig({testDir:".",testMatch:"battle-ui.pw.ts",fullyParallel:true,use:{headless:true,launchOptions:process.env.ROBOT_BROWSER_EXECUTABLE?{executablePath:process.env.ROBOT_BROWSER_EXECUTABLE,args:["--no-sandbox","--disable-gpu","--disable-software-rasterizer"]}:{}},projects:robotLandscapeProjects,outputDir:"test-results/robot-battle-browser"});
