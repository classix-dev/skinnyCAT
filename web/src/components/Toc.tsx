// The page's table of contents, one row of links under the hero.
const ITEMS: [string, string][] = [
  ["demo", "Demo"],
  ["how-it-works", "How It Works"],
  ["explainer", "The Signature"],
  ["key-degradation", "Key Degradation"],
  ["frame-transactions", "Frame Transactions"],
  ["aggregation", "Aggregation"],
  ["limitations", "Limitations"],
];

export function Toc() {
  return (
    <nav aria-label="On this page" data-testid="toc" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1.5 whitespace-nowrap sm:flex-wrap">
        {ITEMS.map(([id, label]) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="inline-flex h-8 items-center rounded-full bg-white/[0.04] px-3 text-[13px] text-muted ring-1 ring-ink-600 ring-inset transition-colors hover:bg-white/[0.08] hover:text-fg"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
