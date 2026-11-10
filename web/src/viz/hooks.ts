// Browser hooks that are safe to render on the server: each one starts from a fixed value and only
// touches window, matchMedia or observers inside effects and subscriptions.
import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

const RM = "(prefers-reduced-motion: reduce)";

const hasMM = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

function subscribeRM(cb: () => void) {
  if (!hasMM()) return () => {};
  const m = window.matchMedia(RM);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

/** Whether the user asked for reduced motion. False on the server. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeRM,
    () => hasMM() && window.matchMedia(RM).matches,
    () => false,
  );
}

/** Whether the element is within `margin` of the viewport. */
export function useInView(ref: RefObject<Element | null>, margin = "0px", threshold = 0): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: margin, threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, threshold]);
  return inView;
}

/** The element's content width, 0 until measured. */
export function useWidth(ref: RefObject<Element | null>): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}
