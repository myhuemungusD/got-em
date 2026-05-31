/**
 * End-to-end craps play-through (2 players) to a win.
 *
 * Drives the REAL `rollCraps` op with deterministic dice through comeout and
 * point rounds, alternating turns, until a slot reaches the 3-round target.
 * Covers a comeout win, a comeout craps loss, a point-set→make, and a
 * seven-out, asserting status/winner/scores/turn at each step.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rollCraps } from "../firebase";
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

describe("craps full game to a win", () => {
  it("plays comeout win, craps loss, point-make, seven-out, then a winning comeout", async () => {
    const code = await makeGame("craps");

    // --- u1 comeout 7 (win) ---
    queueDice(3, 4);
    await rollCraps({ code, byUid: "u1" });
    let g = await get(code);
    expect(g.slots[0]!.score).toBe(1);
    expect(g.craps).toEqual({ phase: "comeout", point: null });
    expect(g.current).toBe(1);
    expect(g.status).toBe("in_progress");

    // --- u2 comeout craps 2 (loss) ---
    queueDice(1, 1);
    await rollCraps({ code, byUid: "u2" });
    g = await get(code);
    expect(g.slots[1]!.score).toBe(0);
    expect(g.current).toBe(0);

    // --- u1 sets point 5, then makes it (win) ---
    queueDice(2, 3); // sum 5 -> point
    await rollCraps({ code, byUid: "u1" });
    g = await get(code);
    expect(g.craps).toEqual({ phase: "point", point: 5 });
    expect(g.current).toBe(0); // same turn

    queueDice(6, 2); // sum 8 -> continue, same turn
    await rollCraps({ code, byUid: "u1" });
    g = await get(code);
    expect(g.craps).toEqual({ phase: "point", point: 5 });
    expect(g.current).toBe(0);

    queueDice(4, 1); // sum 5 -> point made
    await rollCraps({ code, byUid: "u1" });
    g = await get(code);
    expect(g.slots[0]!.score).toBe(2);
    expect(g.craps).toEqual({ phase: "comeout", point: null });
    expect(g.current).toBe(1);

    // --- u2 sets point 6, then sevens out (loss) ---
    queueDice(2, 4); // sum 6 -> point
    await rollCraps({ code, byUid: "u2" });
    g = await get(code);
    expect(g.craps).toEqual({ phase: "point", point: 6 });
    expect(g.current).toBe(1);

    queueDice(3, 4); // sum 7 -> seven out
    await rollCraps({ code, byUid: "u2" });
    g = await get(code);
    expect(g.slots[1]!.score).toBe(0);
    expect(g.craps).toEqual({ phase: "comeout", point: null });
    expect(g.current).toBe(0);

    // --- u1 comeout 11 -> 3rd win finishes the game ---
    queueDice(5, 6);
    await rollCraps({ code, byUid: "u1" });
    g = await get(code);
    expect(g.slots[0]!.score).toBe(3);
    expect(g.status).toBe("finished");
    expect(g.winner).toBe("u1");
    expect(g.current).toBe(0); // did NOT advance after the win
  });

  it("lets the trailing player win the race when the leader sevens out", async () => {
    const code = await makeGame("craps");

    // u1 climbs to 2 wins via two comeout naturals.
    queueDice(3, 4); // 7
    await rollCraps({ code, byUid: "u1" });
    queueDice(6, 6); // u2 comeout 12 craps -> loss
    await rollCraps({ code, byUid: "u2" });
    queueDice(5, 6); // u1 comeout 11 -> 2nd win
    await rollCraps({ code, byUid: "u1" });
    let g = await get(code);
    expect(g.slots[0]!.score).toBe(2);
    expect(g.current).toBe(1);

    // u2 sets a point then sevens out — stays at 0.
    queueDice(3, 1); // point 4
    await rollCraps({ code, byUid: "u2" });
    queueDice(1, 6); // seven out
    await rollCraps({ code, byUid: "u2" });
    g = await get(code);
    expect(g.slots[1]!.score).toBe(0);
    expect(g.current).toBe(0);

    // u1 finishes on a comeout 7.
    queueDice(4, 3);
    await rollCraps({ code, byUid: "u1" });
    g = await get(code);
    expect(g.status).toBe("finished");
    expect(g.winner).toBe("u1");
    expect(g.slots[0]!.score).toBe(3);
  });
});
