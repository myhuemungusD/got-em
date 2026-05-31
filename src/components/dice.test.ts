import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildFace, buildDie, renderDice, clearDice, haptic } from "./dice";
import { createHand } from "./hand";

function makeRoot(): HTMLElement {
  document.body.innerHTML = "";
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

const PIP_COUNT: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };

const PIP_CLASSES: Record<number, string[]> = {
  1: ["p-mc"],
  2: ["p-tl", "p-br"],
  3: ["p-tl", "p-mc", "p-br"],
  4: ["p-tl", "p-tr", "p-bl", "p-br"],
  5: ["p-tl", "p-tr", "p-mc", "p-bl", "p-br"],
  6: ["p-tl", "p-tr", "p-ml", "p-mr", "p-bl", "p-br"],
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("buildFace", () => {
  it("lays out the correct pip count and classes for each value 1-6", () => {
    for (let v = 1; v <= 6; v++) {
      const face = buildFace(v);
      expect(face.classList.contains("face")).toBe(true);
      expect(face.classList.contains("f" + v)).toBe(true);
      const pips = face.querySelectorAll(".pip");
      expect(pips.length).toBe(PIP_COUNT[v]);
      const classes = Array.from(pips).map((p) =>
        Array.from(p.classList).find((c) => c.startsWith("p-")),
      );
      expect(classes).toEqual(PIP_CLASSES[v]);
    }
  });
});

describe("buildDie", () => {
  it("renders all six faces and records the value", () => {
    const die = buildDie(4);
    expect(die.classList.contains("die")).toBe(true);
    expect(die.dataset["value"]).toBe("4");
    expect(die.querySelectorAll(".face").length).toBe(6);
  });

  it("sets the --final-rot custom property and transform", () => {
    const die = buildDie(6);
    expect(die.style.getPropertyValue("--final-rot")).toContain("rotateY(180deg)");
    expect(die.style.transform).toContain("rotateY(180deg)");
  });

  it("applies kept and scoring classes from opts", () => {
    const kept = buildDie(2, { kept: true });
    expect(kept.classList.contains("kept")).toBe(true);
    expect(kept.classList.contains("scoring")).toBe(false);

    const scoring = buildDie(2, { scoring: true });
    expect(scoring.classList.contains("scoring")).toBe(true);

    const plain = buildDie(2);
    expect(plain.classList.contains("kept")).toBe(false);
    expect(plain.classList.contains("scoring")).toBe(false);
  });

  it("writes data-id only when id is provided", () => {
    expect(buildDie(1, { id: 3 }).dataset["id"]).toBe("3");
    expect(buildDie(1, { id: 0 }).dataset["id"]).toBe("0");
    expect(buildDie(1).dataset["id"]).toBeUndefined();
  });

  it("clamps out-of-range values to 1-6", () => {
    expect(buildDie(0).dataset["value"]).toBe("1");
    expect(buildDie(9).dataset["value"]).toBe("6");
  });
});

describe("renderDice", () => {
  it("clears then builds one die per value", () => {
    const c = makeRoot();
    c.appendChild(document.createElement("span"));
    renderDice(c, [1, 2, 3]);
    const dice = c.querySelectorAll(".die");
    expect(dice.length).toBe(3);
    expect(c.querySelector("span")).toBeNull();
    expect(Array.from(dice).map((d) => (d as HTMLElement).dataset["value"])).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("marks kept and scoring indices", () => {
    const c = makeRoot();
    renderDice(c, [5, 5, 5, 5], { kept: [0, 2], scoring: [1] });
    const dice = Array.from(c.querySelectorAll<HTMLElement>(".die"));
    expect(dice[0]?.classList.contains("kept")).toBe(true);
    expect(dice[2]?.classList.contains("kept")).toBe(true);
    expect(dice[1]?.classList.contains("scoring")).toBe(true);
    expect(dice[3]?.classList.contains("kept")).toBe(false);
    expect(dice[3]?.classList.contains("scoring")).toBe(false);
  });

  it("binds click to the die index", () => {
    const c = makeRoot();
    const clicks: number[] = [];
    renderDice(c, [1, 1, 1], { onClick: (idx) => clicks.push(idx) });
    const dice = Array.from(c.querySelectorAll<HTMLElement>(".die"));
    dice[2]?.click();
    dice[0]?.click();
    expect(clicks).toEqual([2, 0]);
  });
});

describe("clearDice", () => {
  it("empties the container", () => {
    const c = makeRoot();
    renderDice(c, [1, 2]);
    clearDice(c);
    expect(c.childElementCount).toBe(0);
  });
});

describe("haptic", () => {
  it("does not throw when navigator.vibrate is unavailable", () => {
    expect("vibrate" in navigator).toBe(false);
    expect(() => haptic(20)).not.toThrow();
    expect(() => haptic([10, 20, 30])).not.toThrow();
  });

  it("forwards to navigator.vibrate when present", () => {
    const spy = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      value: spy,
      configurable: true,
      writable: true,
    });
    try {
      haptic(40);
      expect(spy).toHaveBeenCalledWith(40);
    } finally {
      delete (navigator as { vibrate?: unknown }).vibrate;
    }
  });

  it("swallows errors thrown by navigator.vibrate", () => {
    Object.defineProperty(navigator, "vibrate", {
      value: () => {
        throw new Error("denied");
      },
      configurable: true,
      writable: true,
    });
    try {
      expect(() => haptic(40)).not.toThrow();
    } finally {
      delete (navigator as { vibrate?: unknown }).vibrate;
    }
  });
});

describe("createHand.animateRoll", () => {
  function setup(): { hand: HTMLElement; dice: HTMLElement } {
    const root = makeRoot();
    const handArea = document.createElement("div");
    const hand = document.createElement("div");
    hand.id = "hand";
    hand.className = "hand show-fist";
    handArea.appendChild(hand);
    const dice = document.createElement("div");
    dice.id = "dice";
    root.appendChild(handArea);
    root.appendChild(dice);
    return { hand, dice };
  }

  const instantSleep = (): Promise<void> => Promise.resolve();

  it("resolves and renders the final faces", async () => {
    const { hand, dice } = setup();
    const h = createHand(hand, { diceContainer: dice, sleep: instantSleep });
    await h.animateRoll([3, 6]);
    const rendered = Array.from(dice.querySelectorAll<HTMLElement>(".die"));
    expect(rendered.length).toBe(2);
    expect(rendered.map((d) => d.dataset["value"])).toEqual(["3", "6"]);
    expect(hand.classList.contains("show-fist")).toBe(true);
    expect(hand.classList.contains("throw")).toBe(false);
  });

  it("marks tumbling dice during the throw", async () => {
    const { hand, dice } = setup();
    const h = createHand(hand, { diceContainer: dice, sleep: instantSleep });
    await h.animateRoll([1, 2, 3]);
    expect(dice.querySelectorAll(".die.tumbling").length).toBe(3);
  });

  it("destroy cancels a pending animation and restores the fist", async () => {
    const { hand, dice } = setup();
    let resolveGate: (() => void) | undefined;
    const gatedSleep = (): Promise<void> =>
      new Promise<void>((resolve) => {
        resolveGate = resolve;
      });
    const h = createHand(hand, { diceContainer: dice, sleep: gatedSleep });
    const p = h.animateRoll([6, 6]);
    h.destroy();
    resolveGate?.();
    await p;
    expect(hand.classList.contains("show-fist")).toBe(true);
    expect(dice.querySelectorAll(".die").length).toBe(0);
  });
});
