import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { TALKS, WhyLean } from "./WhyLean";

describe("Why leanSPHINCS", () => {
  test("says why it replaces ECDSA and links the Devcon 8 recordings", () => {
    render(<WhyLean />);
    const box = screen.getByTestId("why-lean");
    expect(box.textContent).toMatch(/ECDSA private key from its public key/);
    expect(box.textContent).toMatch(/hash functions alone/);
    expect(box.querySelector("p a")?.getAttribute("href")).toMatch(/telsy\.com/);
    const links = [...box.querySelectorAll("li a")];
    expect(links).toHaveLength(TALKS.length);
    for (const a of links) expect(a.getAttribute("href")).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/);
    expect(box.textContent).not.toMatch(/[—;]/);
  });
});
