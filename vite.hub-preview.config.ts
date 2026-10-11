import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
export default defineConfig({cacheDir:"node_modules/.vite-hub-preview",plugins:[react(),cloudflare({configPath:"wrangler.hub-preview.jsonc"})],build:{outDir:"dist-hub-preview"},optimizeDeps:{include:["zod"]}});
