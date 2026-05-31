import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createRoom,
  joinRoom,
  startGame,
  readGame,
  updateGameTx,
} from "./index";
import { rollCraps } from "./gameplay";
import { __resetMock } from "./mock";
import { setDieSource, resetDieSource } from "../scoring/dice";
import type { GameDoc, GameMode } from "./types";

/* ---------------------------------------------------------------- */
/* Deterministic dice: queue values, consumed one die at a time.    */
/* ---------------------------------------------------------------- */

/** Install a die source that yields `values` in order, then throws if drained. */
function queueDice(...values: number[]): void {
  let i = 0;
  setDieSource(() => {
    if (i >= values.length) throw new Error("die queue exhausted");
    return values[i++]!;
  });
}

beforeEach(() => {
  __resetMock();
});

afterEach(() => {
  resetDieSource();
});

/** Build a fully-seated 2-player in-progress game in `mode`; u1 goes first. */
async function makeGame(mode: GameMode): Promise<string> {
  const code = await createRoom({
    mode,
    numPlayers: 2,
    hostUid: "u1",
    hostName: "Alice",
  });
  await joinRoom({ code, slotIdx: 1, uid: "u2", name: "Bob" });
  await startGame({ code, hostUid: "u1" });
  return code;
}

async function get(code: string): Promise<GameDoc> {
  return (await readGame(code)) as GameDoc;
}

/* ================================================================ */
/* Common gates                                                     */
/* ================================================================ */

describe("turn/status gates", () => {
  it("rejects a roll when it is not the caller's turn", async () => {
    const code = await makeGame("craps");
    queueDice(3, 4);
    await expect(rollCraps({ code, byUid: "u2" })).rejects.toThrow(
      "NOT_YOUR_TURN",
    );
  });

  it("rejects a roll when the game is not in progress", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "Alice",
    });
    // still waiting (not all slots filled)
    queueDice(3, 4);
    await expect(rollCraps({ code, byUid: "u1" })).rejects.toThrow(
      "NOT_IN_PROGRESS",
    );
  });
});

/* ================================================================ */
/* Craps                                                            */
/* ================================================================ */

describe("rollCraps", () => {
  it("comeout 7 wins the round (+1 score) and advances", async () => {
    const code = await makeGame("craps");
    queueDice(3, 4); // sum 7
    await rollCraps({ code, byUid: "u1" });
    const g = await get(code);
    expect(g.slots[0]!.score).toBe(1);
    expect(g.current).toBe(1);
    expect(g.craps).toEqual({ phase: "comeout", point: null });
    expect(g.lastRoll).toEqual([3, 4]);
    expect(g.lastRolledBy).toBe("u1");
    expect(g.lastRollId).toBeTruthy();
  });

  it("comeout craps (2/3/12) loses the round and advances, no score", async () => {
    const code = await makeGame("craps");
    queueDice(1, 1); // sum 2 = craps
    await rollCraps({ code, byUid: "u1" });
    const g = await get(code);
    expect(g.slots[0]!.score).toBe(0);
    expect(g.current).toBe(1);
    expect(g.craps).toEqual({ phase: "comeout", point: null });
  });

  it("comeout non-decision sets the point and keeps the same turn", async () => {
    const code = await makeGame("craps");
    queueDice(2, 3); // sum 5 = point
    await rollCraps({ code, byUid: "u1" });
    const g = await get(code);
    expect(g.craps).toEqual({ phase: "point", point: 5 });
    expect(g.current).toBe(0); // same turn
  });

  it("point phase: making the point scores and resets to comeout", async () => {
    const code = await makeGame("craps");
    queueDice(2, 3); // point 5
    await rollCraps({ code, byUid: "u1" });
    queueDice(4, 1); // 5 again -> point made
    await rollCraps({ code, byUid: "u1" });
    const g = await get(code);
    expect(g.slots[0]!.score).toBe(1);
    expect(g.craps).toEqual({ phase: "comeout", point: null });
    expect(g.current).toBe(1);
  });

  it("point phase: seven-out loses and advances", async () => {
    const code = await makeGame("craps");
    queueDice(2, 3); // point 5
    await rollCraps({ code, byUid: "u1" });
    queueDice(3, 4); // 7 -> seven out
    await rollCraps({ code, byUid: "u1" });
    const g = await get(code);
    expect(g.slots[0]!.score).toBe(0);
    expect(g.craps).toEqual({ phase: "comeout", point: null });
    expect(g.current).toBe(1);
  });

  it("point phase: non-point/non-seven continues the same turn", async () => {
    const code = await makeGame("craps");
    queueDice(2, 3); // point 5
    await rollCraps({ code, byUid: "u1" });
    queueDice(6, 2); // 8 -> continue
    await rollCraps({ code, byUid: "u1" });
    const g = await get(code);
    expect(g.craps).toEqual({ phase: "point", point: 5 });
    expect(g.current).toBe(0);
  });

  it("reaching 3 round wins finishes the game", async () => {
    const code = await makeGame("craps");
    // Pre-set u1 to 2 wins via the sanctioned helper.
    await updateGameTx(code, (doc, commit) => {
      const slots = [...doc.slots];
      slots[0] = { ...slots[0]!, score: 2 };
      commit({ slots });
    });
    queueDice(5, 6); // sum 11 = comeout win
    await rollCraps({ code, byUid: "u1" });
    const g = await get(code);
    expect(g.slots[0]!.score).toBe(3);
    expect(g.status).toBe("finished");
    expect(g.winner).toBe("u1");
    expect(g.current).toBe(0); // did NOT advance
  });
});
