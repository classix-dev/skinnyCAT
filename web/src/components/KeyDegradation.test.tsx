import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { App } from "../App";
import { KeyDegradation, wearBits } from "./KeyDegradation";

describe("Key Degradation", () => {
  test("the model sits near the proof's 127 bits at 2^30 and falls about 20 bits per doubling after", () => {
    expect(wearBits(20)).toBe(128);
    expect(wearBits(30)).toBeGreaterThan(125);
    expect(wearBits(32)).toBeGreaterThan(85);
    expect(wearBits(32)).toBeLessThan(100);
    expect(wearBits(35)).toBeLessThan(40);
    expect(wearBits(38)).toBeLessThan(2);
  });

  test("says why keys wear out and what to do, and quotes EthLib", () => {
    render(<KeyDegradation />);
    const sec = screen.getByTestId("wear");
    expect(sec.textContent).toMatch(/2\s*30 signatures per key, where standard SLH-DSA is sized for 2\s*64/);
    expect(sec.textContent).toContain("don't use one key millions of times");
    expect(sec.querySelector("blockquote")?.textContent).toMatch(/Never sign more than 2\^30 messages with one key/);
    expect(sec.textContent).not.toMatch(/[—;]/);
  });

  test("the slider moves the count, the open leaves and the bits", () => {
    render(<KeyDegradation />);
    expect(screen.getByTestId("wear-count").textContent).toMatch(/30, about 1\.1 billion/);
    expect(screen.getByTestId("wear-bits").dataset.tone).toBe("ok");
    const open30 = Number(screen.getByTestId("wear-open").textContent!.replace(/,/g, ""));
    fireEvent.change(screen.getByTestId("wear-slider"), { target: { value: "36" } });
    expect(screen.getByTestId("wear-bits").dataset.tone).toBe("bad");
    expect(Number(screen.getByTestId("wear-open").textContent!.replace(/,/g, ""))).toBeGreaterThan(open30);
  });

  test("every table of contents link has a target on the page", () => {
    render(<App autoStart={false} />);
    const links = [...screen.getByTestId("toc").querySelectorAll("a")];
    expect(links).toHaveLength(7);
    for (const a of links) expect(document.getElementById(a.getAttribute("href")!.slice(1)), a.textContent!).toBeTruthy();
  });
});
