// Renders "2^128" in copy as 2 with a superscript 128.
import type { ReactNode } from "react";

export function rich(text: string): ReactNode {
  const parts = text.split(/(\d+\^\d+)/);
  if (parts.length === 1) return text;
  return parts.map((p, i) => {
    const m = /^(\d+)\^(\d+)$/.exec(p);
    return m ? (
      <span key={i} className="whitespace-nowrap">
        {m[1]}
        <sup className="ml-px text-[0.68em]">{m[2]}</sup>
      </span>
    ) : (
      p
    );
  });
}
