import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { FrameExplainer } from "./FrameExplainer";

const rows = () => ["r1", "r2", "r3"].map((p) => screen.queryByTestId(`fx-${p}`)?.textContent ?? null).filter(Boolean) as string[];
const caption = () => screen.getByTestId("fx-caption").textContent!;
const next = () => act(() => fireEvent.click(screen.getByTestId("fx-next")));
const mode = (m: string) => fireEvent.click(screen.getByTestId(`fx-mode-${m}`));

describe("Meta-transaction against frame transaction", () => {
  test("pre-renders today's meta-transaction at its last step", () => {
    const html = renderToString(<FrameExplainer />).replace(/&#x27;/g, "'");
    expect(html).toContain('data-mode="meta"');
    expect(html).toContain('data-step="6"');
    expect(html).toContain("needs a relayer, its ECDSA key, and Bob's money inside a wrapper");
  });

  test("today: a legacy transaction from the relayer, with Bob's signed message inside a call to scETC", () => {
    render(<FrameExplainer />);
    expect(screen.getByTestId("fx-tx").textContent).toMatch(/0x00, legacy/);
    expect(screen.getByTestId("fx-sender").textContent).toBe("sender: the relayer");
    const r = rows();
    expect(r[0]).toMatch(/CALL.*scETC.*transfer/);
    expect(r[1]).toMatch(/MESSAGE.*from Bob/);
    expect(within(screen.getByTestId("fx-relayer")).getByText("pays gas")).toBeTruthy();
    expect(screen.getByTestId("fx-hash").textContent).toMatch(/relayer signs the transaction with ECDSA/);
  });

  test("sponsored frame transaction: Bob's VERIFY, the paymaster's VERIFY for payment, then SENDER, from Bob's account", () => {
    render(<FrameExplainer />);
    mode("paymaster");
    expect(screen.getByTestId("fx-mode-paymaster").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("fx-sender").textContent).toBe("sender: Bob's account");
    const r = rows();
    expect(r).toHaveLength(3);
    expect(r[0]).toMatch(/VERIFY.*Bob's account.*approves execution$/);
    expect(r[1]).toMatch(/VERIFY.*paymaster.*approves payment/);
    expect(r[2]).toMatch(/SENDER.*Alice/);
    expect(caption()).toMatch(/the job a relayer does today/);
  });

  test("the leanSPHINCS signature is marked the same in every mode", () => {
    render(<FrameExplainer />);
    for (const m of ["meta", "paymaster", "self"]) {
      mode(m);
      expect(screen.getByTestId("fx-sig").textContent).toMatch(/leanSPHINCS|ARBITRARY/);
      expect(screen.getByTestId("fx-same").textContent).toBe("same in all three");
    }
  });

  test("Bob pays: stepping lights each part, and the payer badge appears at APPROVE", () => {
    render(<FrameExplainer />);
    mode("self");
    expect(screen.getByTestId("fx-caption").dataset.step).toBe("1");
    expect(within(screen.getByTestId("fx-bob")).queryByText("pays gas")).toBeNull();
    next();
    expect(screen.getByTestId("fx-hash").textContent).toContain("signature's bytes left out");
    next();
    expect(caption()).toMatch(/Frame 1, VERIFY/);
    expect(screen.getByTestId("fx-r1").dataset.lit).toBe("1");
    expect(screen.getByTestId("fx-sig").dataset.lit).toBe("1");
    next();
    expect(caption()).toMatch(/APPROVE for execution and payment/);
    expect(within(screen.getByTestId("fx-bob")).getByText("pays gas")).toBeTruthy();
    next();
    expect(screen.getByTestId("fx-alice").textContent).toContain("received 0.1 ETC");
  });

  test("the words follow the style guide", () => {
    const { container } = render(<FrameExplainer />);
    for (const m of ["meta", "paymaster", "self"]) {
      mode(m);
      expect(container.textContent).not.toMatch(/[—;]/);
    }
  });
});
