import { describe, it, expect } from "vitest";
import { toDisplayText, apiErrorText, revertText } from "../lib/apiText";

/**
 * Regression suite for the crash class that white-screened the settlement room.
 *
 * `/api/settle/simulate` answers a blocked leg with
 *   { ok:false, wouldRevert:true, detail:<object>, message:<string> }
 * — no `error` key. The old code did `setError(json.error ?? …)` into
 * `string | null` state and rendered it as a React child, which threw
 * "Objects are not valid as a React child" and replaced the entire page with
 * "Application error: a client-side exception has occurred".
 *
 * Every assertion below exists to keep an object from reaching JSX.
 */

describe("toDisplayText", () => {
  it("passes a plain string through", () => {
    expect(toDisplayText("insufficient balance", "fallback")).toBe("insufficient balance");
  });

  it("trims and falls back on a blank string", () => {
    expect(toDisplayText("   ", "fallback")).toBe("fallback");
  });

  it("falls back on null and undefined", () => {
    expect(toDisplayText(null, "fallback")).toBe("fallback");
    expect(toDisplayText(undefined, "fallback")).toBe("fallback");
  });

  it("serialises an object instead of returning it", () => {
    const out = toDisplayText({ reason: "ERC20: transfer amount exceeds balance" }, "fallback");
    expect(typeof out).toBe("string");
    expect(out).toContain("ERC20: transfer amount exceeds balance");
  });

  it("serialises an array instead of returning it", () => {
    const out = toDisplayText([{ a: 1 }, { b: 2 }], "fallback");
    expect(typeof out).toBe("string");
    expect(out).toBe('[{"a":1},{"b":2}]');
  });

  it("falls back on an empty object rather than showing '{}'", () => {
    expect(toDisplayText({}, "fallback")).toBe("fallback");
    expect(toDisplayText([], "fallback")).toBe("fallback");
  });

  it("renders numbers, bigints and booleans", () => {
    expect(toDisplayText(0, "fallback")).toBe("0");
    expect(toDisplayText(false, "fallback")).toBe("false");
    expect(toDisplayText(10n, "fallback")).toBe("10");
  });

  it("unwraps an Error to its message", () => {
    expect(toDisplayText(new Error("boom"), "fallback")).toBe("boom");
  });

  it("survives a circular structure", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    expect(toDisplayText(circular, "fallback")).toBe("fallback");
  });

  it("clamps very long payloads so one blob cannot own the panel", () => {
    const out = toDisplayText("x".repeat(5000), "fallback");
    expect(out.length).toBeLessThanOrEqual(400);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("apiErrorText", () => {
  it("reads a string error key", () => {
    expect(apiErrorText({ error: "KeeperHub 502" }, "fallback")).toBe("KeeperHub 502");
  });

  it("stringifies an object error key rather than leaking it to JSX", () => {
    const out = apiErrorText({ error: { code: 502, upstream: "keeperhub" } }, "fallback");
    expect(typeof out).toBe("string");
    expect(out).toContain("502");
  });

  it("falls back when the body carries no error key at all", () => {
    // This is the exact shape the 409 returns.
    expect(apiErrorText({ ok: false, wouldRevert: true, detail: {} }, "Simulation failed (HTTP 409)")).toBe(
      "Simulation failed (HTTP 409)",
    );
  });

  it("falls back on a non-object body", () => {
    expect(apiErrorText(null, "fallback")).toBe("fallback");
    expect(apiErrorText("plain text body", "fallback")).toBe("plain text body");
  });
});

describe("revertText", () => {
  it("joins message and object detail into one readable line", () => {
    const body = {
      ok: false,
      wouldRevert: true,
      message: "simulation reverted",
      detail: { reason: "ERC20: transfer amount exceeds balance" },
    };
    const out = revertText(body);
    expect(typeof out).toBe("string");
    expect(out).toContain("simulation reverted");
    expect(out).toContain("ERC20: transfer amount exceeds balance");
  });

  it("uses message alone when detail is absent", () => {
    expect(revertText({ message: "simulation reverted" })).toBe("simulation reverted");
  });

  it("uses detail alone when message is absent", () => {
    expect(revertText({ detail: "nonce already used" })).toBe("nonce already used");
  });

  it("does not print the same text twice", () => {
    expect(revertText({ message: "would revert", detail: "would revert" })).toBe("would revert");
  });

  it("falls back rather than returning an empty string", () => {
    expect(revertText({})).toBe("would revert");
    expect(revertText(null)).toBe("would revert");
    expect(revertText({ ok: false, wouldRevert: true })).toBe("would revert");
  });

  it("never returns a non-string, whatever the body shape", () => {
    const shapes: unknown[] = [
      { detail: { a: { b: { c: 1 } } } },
      { message: 42, detail: [1, 2, 3] },
      { message: null, detail: undefined },
      [],
      0,
      "",
    ];
    for (const shape of shapes) {
      expect(typeof revertText(shape)).toBe("string");
    }
  });
});
