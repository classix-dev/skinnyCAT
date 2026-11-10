import * as RTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { HashTree } from "./components/Brand";
import { Header } from "./components/Header";
import { HowItWorks } from "./components/HowItWorks";
import { KeyStep } from "./components/KeyStep";
import { SendStep } from "./components/SendStep";
import { WalletStep } from "./components/WalletStep";
import { useApp } from "./store";

// The page shell is static HTML in index.html. React fills its slots.
const slot = (id: string, node: ReactNode) => {
  const el = document.getElementById(id);
  return el ? createPortal(node, el) : null;
};

function NetMobile() {
  const { net } = useApp();
  return <>{net.testnet ? net.name : ""}</>;
}

function Tree() {
  const { sending, keyView } = useApp();
  return <HashTree active={sending || keyView === "busy"} className="w-full" />;
}

export function App() {
  return (
    <RTooltip.Provider delayDuration={200}>
      {slot("r-header", <Header />)}
      {slot("r-net", <NetMobile />)}
      {slot("r-tree", <Tree />)}
      {slot("r-how", <HowItWorks />)}
      {slot(
        "r-steps",
        <>
          <KeyStep />
          <WalletStep />
          <SendStep />
        </>,
      )}
    </RTooltip.Provider>
  );
}
