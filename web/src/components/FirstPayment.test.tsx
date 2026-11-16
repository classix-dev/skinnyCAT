import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { DEFAULTS } from "../config";
import { FirstPayment } from "./FirstPayment";

describe("The First Payment", () => {
  test("gives the block, the time and the memo, and links all three transactions", () => {
    render(<FirstPayment />);
    const sec = screen.getByTestId("first-payment");
    expect(sec.textContent).toContain("in block 25,742,237");
    expect(sec.textContent).toContain("2026-11-16 at 00:52 UTC");
    expect(screen.getByTestId("first-memo").textContent).toBe(DEFAULTS.memo);
    const links = [...sec.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toHaveLength(3);
    for (const h of links) expect(h).toMatch(/^https:\/\/etc\.blockscout\.com\/tx\/0x[0-9a-f]{64}$/);
    expect(sec.textContent).not.toMatch(/[—;]/);
  });
});
