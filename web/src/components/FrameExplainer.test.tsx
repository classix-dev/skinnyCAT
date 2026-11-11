import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { FrameExplainer } from "./FrameExplainer";

const frames = () => ["f1", "f2", "f3"].map((p) => screen.queryByTestId(`fx-${p}`)?.textContent ?? null).filter(Boolean) as string[];
const caption = () => screen.getByTestId("fx-caption").textContent!;
const next = () => act(() => fireEvent.click(screen.getByTestId("fx-next")));

describe("Frame transaction explainer", () => {
  test("pre-renders the last step at rest, with Bob paying", () => {
    const html = renderToString(<FrameExplainer />).replace(/&#x27;/g, "'");
    expect(html).toContain('data-step="6"');
    expect(html).toContain("No relayer, no wrapped token, and no ECDSA key anywhere.");
    expect(html).toContain("keccak256(0x06 ‖ rlp(tx))");
  });

  test("Bob pays: VERIFY then SENDER, and VERIFY approves execution and payment", () => {
    render(<FrameExplainer />);
    const f = frames();
    expect(f).toHaveLength(2);
    expect(f[0]).toMatch(/VERIFY.*Bob's account.*approves execution and payment/);
    expect(f[1]).toMatch(/SENDER.*Alice.*0\.1 ETC/);
    expect(screen.getByTestId("fx-sig").textContent).toMatch(/ARBITRARY.*7,740 bytes/);
  });

  test("a paymaster: Bob's VERIFY, then the paymaster's VERIFY for payment, then SENDER", () => {
    render(<FrameExplainer />);
    fireEvent.click(screen.getByTestId("fx-mode-paymaster"));
    expect(screen.getByTestId("fx-mode-paymaster").getAttribute("aria-pressed")).toBe("true");
    const f = frames();
    expect(f).toHaveLength(3);
    expect(f[0]).toMatch(/VERIFY.*Bob's account.*approves execution$/);
    expect(f[1]).toMatch(/VERIFY.*paymaster.*approves payment/);
    expect(f[2]).toMatch(/SENDER.*Alice/);
  });

  test("stepping lights each part, and the payer badge appears at APPROVE", () => {
    render(<FrameExplainer />);
    fireEvent.click(screen.getByTestId("fx-mode-self"));
    // The mode switch restarts at step 1.
    expect(screen.getByTestId("fx-caption").dataset.step).toBe("1");
    expect(within(screen.getByTestId("fx-bob")).queryByText("pays gas")).toBeNull();
    next();
    expect(screen.getByTestId("fx-hash").textContent).toContain("signature bytes left out");
    next();
    expect(caption()).toMatch(/Frame 1, VERIFY/);
    expect(screen.getByTestId("fx-f1").dataset.lit).toBe("1");
    expect(screen.getByTestId("fx-sig").dataset.lit).toBe("1");
    next();
    expect(caption()).toMatch(/APPROVE for execution and payment/);
    expect(within(screen.getByTestId("fx-bob")).getByText("pays gas")).toBeTruthy();
    next();
    expect(screen.getByTestId("fx-alice").textContent).toContain("received 0.1 ETC");
  });

  test("the words follow the style guide", () => {
    const { container } = render(<FrameExplainer />);
    expect(container.textContent).not.toMatch(/[—;]/);
  });
});
