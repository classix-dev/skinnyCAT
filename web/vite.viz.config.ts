// The explainer's standalone preview, web/viz.html, kept apart from the app's vite.config.ts.
//
//   npx vite --config vite.viz.config.ts --port 4517         then open /viz.html
//   npx vite build --config vite.viz.config.ts               writes dist/viz-preview/
//   npx vite preview --config vite.viz.config.ts --port 4518
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config.ts";

export default mergeConfig(
  base,
  defineConfig({
    build: {
      outDir: "dist/viz-preview",
      emptyOutDir: true,
      // Relative to the project root (web/), where vite runs.
      rollupOptions: { input: { viz: "viz.html" } },
    },
    preview: { open: "/viz.html" },
  }),
);
