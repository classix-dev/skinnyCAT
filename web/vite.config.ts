import { defineConfig } from "vite";

export default defineConfig({
  // The signer lives in ../signer and is imported from source.
  server: { fs: { allow: [".."] } },
  worker: { format: "es" },
  build: { target: "es2022", sourcemap: true },
});
