// Build-time entry: renders the page to HTML for scripts/prerender.mjs. Nothing browser-only runs,
// since the store starts in an effect.
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App";

export function render(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
