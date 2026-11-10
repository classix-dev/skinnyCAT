import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./style.css";

// The page is pre-rendered HTML. Hydrate once it has painted, so the big chunk (React, viem and
// the signer client) doesn't hold up the first paint.
const load = () => void import("./boot");
const afterPaint = () => requestAnimationFrame(() => setTimeout(load, 0));
if (document.fonts?.status === "loading") void document.fonts.ready.then(afterPaint);
else afterPaint();
