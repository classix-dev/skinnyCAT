import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";

const el = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
// The build pre-renders the page into #root. The dev server serves it empty.
if (el.firstElementChild) {
  hydrateRoot(el, app, {
    onRecoverableError: (e, info) => console.error("hydration:", e, info?.componentStack ?? ""),
  });
} else {
  createRoot(el).render(app);
}
