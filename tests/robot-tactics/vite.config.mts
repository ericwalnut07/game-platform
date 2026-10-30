import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({root:resolve(process.cwd(),"tests/robot-tactics"),server:{host:"127.0.0.1",port:4197,strictPort:true,fs:{allow:[process.cwd()]}}});
