import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  worker: { format: "es" },
  build: { chunkSizeWarningLimit: 1600 },
  server: { port: 5173 },
});
