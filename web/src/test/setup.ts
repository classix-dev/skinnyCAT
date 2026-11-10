import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";

// Any console.error (React warnings, hydration mismatches, act() warnings) fails the test.
let errors: unknown[][] = [];
beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    errors.push(a);
  });
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  expect(errors.map((a) => a.map(String).join(" ")), "console.error calls").toEqual([]);
});
