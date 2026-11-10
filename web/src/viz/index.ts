// The leanSPHINCS explainer. Mount <Explainer /> for the toggle between "Like I'm Five" (the
// default) and "The Real Thing", which loads the detailed scenes only when chosen. Both are safe to
// prerender. <SphincsExplainer /> is the detailed version on its own, each animated scene loading
// as its own chunk when it nears the viewport.
export { Explainer } from "./Explainer";
export { SphincsExplainer } from "./SphincsExplainer";
export type { Mode } from "./mode";
export type { VizConfig } from "./timeline";
