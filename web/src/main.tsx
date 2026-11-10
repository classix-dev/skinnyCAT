import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./style.css";

// The hero and footer are static HTML. Load the app once they have painted, so the big chunk
// (React, viem and the signer client) doesn't hold up the first paint.
const load = () => void import("./boot");
const afterPaint = () => requestAnimationFrame(() => setTimeout(load, 0));
if (document.fonts?.status === "loading") void document.fonts.ready.then(afterPaint);
else afterPaint();
