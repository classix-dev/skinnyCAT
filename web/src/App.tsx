import * as RTooltip from "@radix-ui/react-tooltip";
import { memo, useEffect } from "react";
import { About } from "./components/About";
import { Aggregation } from "./components/Aggregation";
import { AliceStep } from "./components/AliceStep";
import { BobStep } from "./components/BobStep";
import { Footer } from "./components/Footer";
import { FrameTransactions } from "./components/FrameTransactions";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { HydrateNear } from "./components/HydrateNear";
import { KeysStep } from "./components/KeysStep";
import { RelayerStep } from "./components/RelayerStep";
import { start, useApp } from "./store";
import { Explainer } from "./viz";

// The two animated diagrams below the demo hydrate once they near the viewport, which keeps the
// first hydration task short. The memos keep App's own re-renders (the store going live) from
// reaching a boundary before it hydrates, which would make React drop the server HTML.
const LateHowItWorks = memo(function LateHowItWorks() {
  return (
    <HydrateNear id="how-it-works">
      <HowItWorks />
    </HydrateNear>
  );
});

const LateAggregation = memo(function LateAggregation() {
  return (
    <HydrateNear id="aggregation">
      <Aggregation />
    </HydrateNear>
  );
});

/** The whole page. Pre-rendered at build time, then hydrated. Browser-only work starts in the effect. */
export function App({ autoStart = true }: { autoStart?: boolean }) {
  const { live } = useApp();
  useEffect(() => {
    if (autoStart) start();
  }, [autoStart]);
  return (
    <RTooltip.Provider delayDuration={200}>
      <div className="backdrop pointer-events-none absolute inset-x-0 top-0 h-[900px]" aria-hidden="true" />
      <div className="relative">
        <a
          href="#demo"
          className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-sm font-medium text-ink-950 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to the demo
        </a>
        <Header />
        <main className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14 lg:pt-20">
          <div className="flex flex-col gap-10 sm:gap-12">
            <Hero />
            <div id="demo" className="scroll-mt-20 grid gap-4 md:grid-cols-2" data-testid="steps" data-live={live ? "1" : undefined}>
              <h2 className="sr-only">The Demo</h2>
              <KeysStep />
              <RelayerStep />
              <AliceStep />
              <BobStep />
            </div>
          </div>
          <div className="mt-24 space-y-24">
            <LateHowItWorks />
            <Explainer />
            <FrameTransactions />
            <LateAggregation />
            <About />
          </div>
        </main>
        <Footer />
      </div>
    </RTooltip.Provider>
  );
}
