import { defineConfig } from "vite";
import { resolve } from "node:path";
import { robotOfflineInlineBuild } from "../../apps/robot-tactics/inlineBuild";
export default defineConfig({root:resolve(process.cwd(),"tests/robot-tactics/offline-fixture"),base:"./",plugins:[robotOfflineInlineBuild()],build:{target:"es2022",outDir:resolve(process.cwd(),"test-results/robot-offline-fixture"),emptyOutDir:true,modulePreload:false,cssCodeSplit:false,rollupOptions:{output:{inlineDynamicImports:true}}}});
