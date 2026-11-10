import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The signer lives in ../signer and is imported from source.
  server: { fs: { allow: [".."] } },
  worker: { format: "es" },
  build: { target: "es2022", sourcemap: true },
});
