/**
 * End-to-end 10,000 (farkle) play-throughs (2 players).
 *
 * Drives the REAL rollTen / bankTen / rollAgainTen ops with deterministic dice.
 * Covers: banking a straight, accumulating across a roll-again before banking,
 * busting (forfeit turnScore + advance), the CHOICE_PENDING guard on re-rolling
 * the initial set, and the NEED_1000 on-board gate.
 *
 * Scoring recap (see scoring/farkle.ts ten10kScoreCombo):
 *   - 1-2-3-4-5-6 straight  -> 1500
 *   - single 1 -> 100, single 5 -> 50
 *   - three of a kind: 1s -> 1000, else face*100
 *   - 2,2,3,4,4,6 -> 0 (no straight, no triples, no three pairs, no 1s/5s) -> FARKLE
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rollTen, bankTen, rollAgainTen } from "../firebase";
import { __resetMock } from "../firebase/mock";
import { resetState } from "../state";
import { resetDieSource } from "../scoring/dice";
import { queueDice, get, makeGame } from "./helpers";

beforeEach(() => {
  __resetMock();
  resetState();
});

afterEach(() => {
  resetDieSource();
});

describe("10,000 play-through", () => {
  it("banks a straight (1500) and advances the turn", async () => {
    const code = await makeGame("ten");

    // Roll a 1-2-3-4-5-6 straight: scores 1500, flags mustChoose.
    queueDice(1, 2, 3, 4, 5, 6);
    await rollTen({ code, byUid: "u1" });
    let g = await get(code);
    expect(g.ten?.mustChoose).toBe(true);
    expect(g.ten?.rolledThisStep).toEqual([1, 2, 3, 4, 5, 6]);
    expect(g.current).toBe(0);

    // Keep all six (the whole straight scores), bank it.
    await bankTen({ code, byUid: "u1", keep: [0, 1, 2, 3, 4, 5] });
    g = await get(code);
    expect(g.slots[0]!.score).toBe(1500);
    expect(g.slots[0]!.onBoard).toBe(true);
    expect(g.ten?.mustChoose).toBe(false);
    expect(g.ten?.turnScore).toBe(0);
    expect(g.current).toBe(1); // turn advanced
    expect(g.status).toBe("in_progress");
  });

  it("roll-agains to accumulate points before banking", async () => {
    const code = await makeGame("ten");

    // First roll: 1,1,1,2,3,4 -> three 1s = 1000 (the 2,3,4 don't score).
    queueDice(1, 1, 1, 2, 3, 4);
    await rollTen({ code, byUid: "u1" });
    let g = await get(code);
    expect(g.ten?.rolledThisStep).toEqual([1, 1, 1, 2, 3, 4]);

    // Keep the three 1s (indices 0,1,2 = 1000), reroll the remaining 3 dice.
    // Reroll yields 5,5,2 -> two 5s score 100 (50 each); kept now [1,1,1].
    queueDice(5, 5, 2);
    await rollAgainTen({ code, byUid: "u1", keep: [0, 1, 2] });
    g = await get(code);
    expect(g.ten?.turnScore).toBe(1000); // banked-into-turn so far
    expect(g.ten?.kept).toEqual([1, 1, 1]);
    expect(g.ten?.rolledThisStep).toEqual([5, 5, 2]);
    expect(g.ten?.mustChoose).toBe(true);
    expect(g.current).toBe(0); // same turn

    // Keep the two 5s (indices 0,1 = 100) and bank: 1000 + 100 = 1100.
    await bankTen({ code, byUid: "u1", keep: [0, 1] });
    g = await get(code);
    expect(g.slots[0]!.score).toBe(1100);
    expect(g.slots[0]!.onBoard).toBe(true);
    expect(g.current).toBe(1);
  });

  it("busting forfeits turnScore and advances the turn", async () => {
    const code = await makeGame("ten");

    // 2,2,3,4,4,6 scores nothing (no 1s/5s, no triple, not three pairs)
    // -> immediate Farkle on the initial roll.
    queueDice(2, 2, 3, 4, 4, 6);
    await rollTen({ code, byUid: "u1" });
    const g = await get(code);
    expect(g.slots[0]!.score).toBe(0);
    expect(g.ten?.turnScore).toBe(0);
    expect(g.ten?.mustChoose).toBe(false);
    expect(g.lastResult).toMatchObject({ outcome: "farkle" });
    expect(g.current).toBe(1); // advanced to u2
  });

  it("a roll-again that busts forfeits the accumulated turnScore", async () => {
    const code = await makeGame("ten");

    // Get on the board mentally: roll three 1s (1000), then roll-again busts.
    queueDice(1, 1, 1, 2, 3, 4);
    await rollTen({ code, byUid: "u1" });

    // Keep the three 1s and reroll 3 dice -> 2,3,4 scores nothing -> Farkle.
    queueDice(2, 3, 4);
    await rollAgainTen({ code, byUid: "u1", keep: [0, 1, 2] });
    const g = await get(code);
    expect(g.slots[0]!.score).toBe(0); // the 1000 is forfeited
    expect(g.ten?.turnScore).toBe(0);
    expect(g.current).toBe(1);
    expect(g.lastResult).toMatchObject({ outcome: "farkle" });
  });

  it("rejects rolling the initial set again while a choice is pending (CHOICE_PENDING)", async () => {
    const code = await makeGame("ten");

    queueDice(1, 2, 3, 4, 5, 6); // straight -> mustChoose true
    await rollTen({ code, byUid: "u1" });
    const g = await get(code);
    expect(g.ten?.mustChoose).toBe(true);

    await expect(rollTen({ code, byUid: "u1" })).rejects.toThrow("CHOICE_PENDING");
  });

  it("rejects a first bank that does not reach 1000 (NEED_1000)", async () => {
    const code = await makeGame("ten");

    // Roll a single scoring die value: 1,2,2,3,3,6 -> only the lone 1 scores 100.
    queueDice(1, 2, 2, 3, 3, 6);
    await rollTen({ code, byUid: "u1" });
    let g = await get(code);
    expect(g.ten?.mustChoose).toBe(true);

    // Bank just the 1 (100) — below the 1000 on-board minimum -> rejected.
    await expect(
      bankTen({ code, byUid: "u1", keep: [0] }),
    ).rejects.toThrow("NEED_1000");

    // No state change: still u1's turn, still pending, not on board.
    g = await get(code);
    expect(g.current).toBe(0);
    expect(g.slots[0]!.score).toBe(0);
    expect(g.slots[0]!.onBoard).toBe(false);
    expect(g.ten?.mustChoose).toBe(true);
  });

  it("rejects banking a non-scoring die in the keep set (ALL_KEPT_MUST_SCORE)", async () => {
    const code = await makeGame("ten");

    queueDice(1, 2, 3, 4, 5, 6);
    await rollTen({ code, byUid: "u1" });

    // Index 1 is the value 2 (dead weight inside an otherwise-scoring keep) —
    // keeping {1 (the "1"), 2} is rejected because the 2 doesn't score.
    await expect(
      bankTen({ code, byUid: "u1", keep: [0, 1] }),
    ).rejects.toThrow("ALL_KEPT_MUST_SCORE");
  });

  it("a hot-dice roll-again rerolls all six and keeps the running turnScore", async () => {
    const code = await makeGame("ten");

    // Roll a full straight (all six score) and keep ALL six via roll-again:
    // hot dice -> kept resets to [] and all six are rerolled, turnScore=1500.
    queueDice(1, 2, 3, 4, 5, 6);
    await rollTen({ code, byUid: "u1" });

    queueDice(1, 1, 1, 5, 2, 3); // reroll all 6: three 1s (1000) + one 5 (50)
    await rollAgainTen({ code, byUid: "u1", keep: [0, 1, 2, 3, 4, 5] });
    const g = await get(code);
    expect(g.ten?.turnScore).toBe(1500); // straight carried over
    expect(g.ten?.kept).toEqual([]); // hot dice cleared kept
    expect(g.ten?.rolledThisStep).toEqual([1, 1, 1, 5, 2, 3]);
    expect(g.ten?.mustChoose).toBe(true);
    expect(g.current).toBe(0);
  });
});
