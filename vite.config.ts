import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // Isolate app optimization from external SSR simulation scripts using default .vite.
  cacheDir: "node_modules/.vite-game-platform",
  plugins: [react(), cloudflare()],
  // Solo practice loads the shared validator lazily. Prebundle it at startup
  // so opening the solo page cannot reload other active multiplayer clients.
  optimizeDeps: { include: ["zod"] }
});
