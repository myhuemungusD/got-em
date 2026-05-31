import { describe, it, expect } from "vitest";
import { MODES, modeMeta } from "./modes";
import type { GameMode } from "./state";

describe("MODES metadata", () => {
  it("has the four ported modes in order", () => {
    expect(MODES.map((m) => m.id)).toEqual(["craps", "clo", "s456", "ten"]);
  });

  it("ports names, dice counts, and taglines from the prototype", () => {
    expect(modeMeta("craps")).toMatchObject({ name: "Craps", short: "CRAPS", dice: 2, tagline: "First to 3 wins" });
    expect(modeMeta("clo")).toMatchObject({ name: "C-Lo", short: "C-LO", dice: 3, tagline: "Highest combo wins" });
    expect(modeMeta("s456")).toMatchObject({ name: "4-5-6", short: "4-5-6", dice: 3, tagline: "Roll 4-5-6 instantly" });
    expect(modeMeta("ten")).toMatchObject({ name: "10,000", short: "10K", dice: 6, tagline: "Race to 10,000" });
  });
});

describe("modeMeta", () => {
  it("looks up each mode by id", () => {
    for (const m of MODES) {
      expect(modeMeta(m.id)).toBe(m);
    }
  });

  it("throws on an unknown mode", () => {
    expect(() => modeMeta("nope" as GameMode)).toThrow(/Unknown game mode/);
  });
});
