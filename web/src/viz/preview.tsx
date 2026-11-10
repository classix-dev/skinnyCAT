// A standalone page for the explainer and its toggle, web/viz.html. #real opens the detailed
// version. `?at=0.5` freezes every scene halfway, for screenshots and frame sequences.
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/geist-mono/wght.css";
import "../style.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Explainer } from "./index";

const at = new URLSearchParams(location.search).get("at");
const stillAt = at === null ? undefined : Math.max(0, Math.min(1, Number(at)));

createRoot(document.getElementById("viz-root")!).render(
  <StrictMode>
    <main className="relative mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <Explainer config={{ stillAt }} />
    </main>
  </StrictMode>,
);
