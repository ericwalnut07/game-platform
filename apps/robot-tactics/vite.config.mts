import { defineConfig } from "vite";
import { resolve } from "node:path";
import { robotOfflineInlineBuild } from "./inlineBuild";
export default defineConfig({root:resolve(process.cwd(),"apps/robot-tactics"),base:"./",plugins:[robotOfflineInlineBuild()],build:{target:"es2022",outDir:resolve(process.cwd(),"dist/robot-tactics-offline"),emptyOutDir:true,modulePreload:false,cssCodeSplit:false,rollupOptions:{output:{inlineDynamicImports:true}}},server:{host:"127.0.0.1",port:4198,strictPort:true,fs:{allow:[process.cwd()],deny:["**/.dev.vars","**/.dev.vars.*","**/.env*","**/.git/**"]}}});
