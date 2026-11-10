/// <reference types="node" />
/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The signer lives in ../signer and is imported from source. PQ_SIGNER_SRC points the build at
// another copy (e2e/run.sh uses it when the working tree's signer and verifier disagree).
const signer = process.env.PQ_SIGNER_SRC ?? fileURLToPath(new URL("../signer/src/index.ts", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "pq-signer": signer } },
  server: { fs: { allow: [".."] } },
  worker: { format: "es" },
  build: { target: "es2022", sourcemap: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    testTimeout: 20_000,
  },
});
