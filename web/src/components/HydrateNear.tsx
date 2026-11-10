// Hydrates a pre-rendered section only once it comes near the viewport. Until then React leaves its
// server HTML alone, so the page stays readable and the first hydration task stays short. Where the
// page wasn't pre-rendered (the dev server, unit tests), it renders straight away.

import { Suspense, use, type ReactNode } from "react";

const waits = new Map<string, Promise<void> | true>();

function near(id: string): Promise<void> | true {
  if (typeof document === "undefined") return true;
  const known = waits.get(id);
  // If the server HTML is gone (React rendered the section on the client after all), don't wait.
  if (known instanceof Promise && !document.getElementById(id)) waits.set(id, true);
  else if (known) return known;
  const el = document.getElementById(id);
  if (!el || typeof IntersectionObserver === "undefined") {
    waits.set(id, true);
    return true;
  }
  const p = new Promise<void>((resolve) => {
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        waits.set(id, true);
        resolve();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
  });
  waits.set(id, p);
  return p;
}

function Gate({ id, children }: { id: string; children: ReactNode }) {
  const w = near(id);
  if (w !== true) use(w);
  return children;
}

/** `id` is the id of the section's root element in the pre-rendered page. */
export function HydrateNear({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Suspense>
      <Gate id={id}>{children}</Gate>
    </Suspense>
  );
}
