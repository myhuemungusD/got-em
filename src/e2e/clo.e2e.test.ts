/**
 * End-to-end C-Lo / 4-5-6 play-throughs (2 players).
 *
 * Drives the REAL `rollClo` op with deterministic dice through the shared
 * c-lo / 4-5-6 engine. Covers: a sole-winner round, a turn handoff after the
 * first player records a non-resolving roll, a tie that clears the tied rolls
 * and restarts, and a full game where the engine finishes on the first
 * sole-winner round (`status: "finished"`).
 *
 * Engine recap (see firebase/gameplay.ts rollClo): each seated player rolls
 * once; the round only resolves on the LAST player's roll. A "reroll" outcome
 * (all three dice distinct, not 4-5-6 / 1-2-3) rolls again on the SAME turn.
 * When everyone has a recorded roll the highest combo rank wins +1 and the
 * game finishes; a tie for the top rank clears the tied players' rolls and
 * resets `current` to the first tied seat so they re-roll.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rollClo } from "../firebase";
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

describe.each(["clo", "s456"] as const)("c-lo engine (mode=%s)", (mode) => {
  it("u1 records 4-5-6 then u2 still gets a turn before the round resolves", async () => {
    const code = await makeGame(mode);

    // u1 rolls the best hand, but the round does NOT resolve yet — u2 owes a
    // roll. The turn advances to u2 and u1's dice are stashed in the matchup.
    queueDice(4, 5, 6);
    await rollClo({ code, byUid: "u1" });
    let g = await get(code);
    expect(g.status).toBe("in_progress");
    expect(g.current).toBe(1); // u2's turn now
    expect(g.matchup?.rolls["u1"]).toEqual([4, 5, 6]);
    expect(g.matchup?.rolls["u2"]).toBeUndefined();
    expect(g.slots[0]!.score).toBe(0); // no score until resolution

    // u2 rolls a plain point — u1's 4-5-6 (rank 1000) wins the round.
    queueDice(2, 3, 3); // point 2, rank 2
    await rollClo({ code, byUid: "u2" });
    g = await get(code);
    expect(g.status).toBe("finished");
    expect(g.winner).toBe("u1");
    expect(g.slots[0]!.score).toBe(1);
    expect(g.slots[1]!.score).toBe(0);
  });

  it("a reroll outcome rolls again on the same turn without advancing", async () => {
    const code = await makeGame(mode);

    // 1-4-6 sorted is 1,4,6 — all distinct, not 4-5-6 / 1-2-3 / a pair: reroll.
    // The same player (u1) must roll again; turn does not advance, no recorded
    // matchup roll yet.
    queueDice(1, 4, 6);
    await rollClo({ code, byUid: "u1" });
    let g = await get(code);
    expect(g.current).toBe(0); // still u1
    expect(g.matchup?.rolls["u1"]).toBeUndefined();
    expect(g.lastResult).toMatchObject({ outcome: "reroll" });

    // u1 rolls a real result; now the turn hands off to u2.
    queueDice(3, 3, 5); // point 5
    await rollClo({ code, byUid: "u1" });
    g = await get(code);
    expect(g.current).toBe(1);
    expect(g.matchup?.rolls["u1"]).toEqual([3, 3, 5]);
  });

  it("a tie for the top rank clears the tied rolls and restarts the round", async () => {
    const code = await makeGame(mode);

    // Both players roll point 5 (rank 5) — a tie for the top rank.
    queueDice(5, 2, 2); // u1: point 2... no, sorted 2,2,5 -> point 5
    await rollClo({ code, byUid: "u1" });
    queueDice(2, 5, 2); // u2: sorted 2,2,5 -> point 5 (tie)
    await rollClo({ code, byUid: "u2" });

    let g = await get(code);
    // Tie: nobody wins, game stays live, both rolls cleared, back to first seat.
    expect(g.status).toBe("in_progress");
    expect(g.winner).toBeNull();
    expect(g.matchup?.rolls["u1"]).toBeUndefined();
    expect(g.matchup?.rolls["u2"]).toBeUndefined();
    expect(g.current).toBe(0);
    expect(g.slots[0]!.score).toBe(0);
    expect(g.slots[1]!.score).toBe(0);

    // Re-roll the round: u1 takes point 6, u2 takes point 4 — u1 wins.
    queueDice(6, 1, 1); // sorted 1,1,6 -> point 6, rank 6
    await rollClo({ code, byUid: "u1" });
    queueDice(4, 1, 1); // sorted 1,1,4 -> point 4, rank 4
    await rollClo({ code, byUid: "u2" });
    g = await get(code);
    expect(g.status).toBe("finished");
    expect(g.winner).toBe("u1");
    expect(g.slots[0]!.score).toBe(1);
  });

  it("plays a full 2-player round to a sole winner (trips beat a point)", async () => {
    const code = await makeGame(mode);

    // u1 rolls trips-3 (rank 103); u2 rolls a point (rank <= 6). u1 wins.
    queueDice(3, 3, 3);
    await rollClo({ code, byUid: "u1" });
    let g = await get(code);
    expect(g.current).toBe(1);
    expect(g.status).toBe("in_progress");

    queueDice(6, 6, 1); // sorted 1,6,6 -> point 1, rank 1
    await rollClo({ code, byUid: "u2" });
    g = await get(code);
    expect(g.status).toBe("finished");
    expect(g.winner).toBe("u1");
    expect(g.slots[0]!.score).toBe(1);
    expect(g.slots[1]!.score).toBe(0);
  });

  it("the loser's 1-2-3 still ranks below any point and loses the round", async () => {
    const code = await makeGame(mode);

    queueDice(1, 2, 3); // u1: auto-loss, rank -1000 — but round waits for u2
    await rollClo({ code, byUid: "u1" });
    let g = await get(code);
    expect(g.current).toBe(1);
    expect(g.status).toBe("in_progress");
    expect(g.matchup?.rolls["u1"]).toEqual([1, 2, 3]);

    queueDice(2, 2, 4); // u2: point 4, rank 4 — beats u1's -1000
    await rollClo({ code, byUid: "u2" });
    g = await get(code);
    expect(g.status).toBe("finished");
    expect(g.winner).toBe("u2");
    expect(g.slots[1]!.score).toBe(1);
  });
});
