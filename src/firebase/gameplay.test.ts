import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createRoom,
  joinRoom,
  startGame,
  readGame,
  updateGameTx,
} from "./index";
import {
  rollCraps,
  rollClo,
  rollTen,
  bankTen,
  rollAgainTen,
} from "./gameplay";
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

/* ================================================================ */
/* C-Lo / 4-5-6                                                     */
/* ================================================================ */

describe("rollClo", () => {
  it("reroll outcome rolls again on the same turn", async () => {
    const code = await makeGame("clo");
    queueDice(1, 3, 5); // no pair/triple/straight -> reroll
    await rollClo({ code, byUid: "u1" });
    const g = await get(code);
    expect(g.current).toBe(0); // same turn
    expect(g.matchup?.rolls.u1).toBeUndefined();
  });

  it("records a determinate roll and advances to the next player", async () => {
    const code = await makeGame("clo");
    queueDice(2, 2, 5); // point 5
    await rollClo({ code, byUid: "u1" });
    const g = await get(code);
    expect(g.matchup?.rolls.u1).toEqual([2, 2, 5]);
    expect(g.current).toBe(1);
  });

  it("when all players have rolled the highest rank wins and finishes", async () => {
    const code = await makeGame("clo");
    queueDice(2, 2, 3); // u1 point 3
    await rollClo({ code, byUid: "u1" });
    queueDice(2, 2, 6); // u2 point 6 -> higher
    await rollClo({ code, byUid: "u2" });
    const g = await get(code);
    expect(g.status).toBe("finished");
    expect(g.winner).toBe("u2");
    expect(g.slots[1]!.score).toBe(1);
  });

  it("4-5-6 (rank 1000) beats a point", async () => {
    const code = await makeGame("clo");
    queueDice(2, 2, 6); // u1 point 6
    await rollClo({ code, byUid: "u1" });
    queueDice(4, 5, 6); // u2 instant 4-5-6
    await rollClo({ code, byUid: "u2" });
    const g = await get(code);
    expect(g.winner).toBe("u2");
  });

  it("tie on top rank clears tied rolls and resets to first tied seat", async () => {
    const code = await makeGame("clo");
    queueDice(3, 3, 5); // u1 point 5
    await rollClo({ code, byUid: "u1" });
    queueDice(1, 1, 5); // u2 point 5 -> tie
    await rollClo({ code, byUid: "u2" });
    const g = await get(code);
    expect(g.status).toBe("in_progress");
    expect(g.matchup?.rolls.u1).toBeUndefined();
    expect(g.matchup?.rolls.u2).toBeUndefined();
    expect(g.current).toBe(0); // first tied seat
  });

  it("s456 uses the same engine", async () => {
    const code = await makeGame("s456");
    queueDice(4, 5, 6);
    await rollClo({ code, byUid: "u1" });
    queueDice(1, 1, 3); // point 3
    await rollClo({ code, byUid: "u2" });
    const g = await get(code);
    expect(g.winner).toBe("u1");
  });
});

/* ================================================================ */
/* 10,000 — initial roll                                            */
/* ================================================================ */

describe("rollTen", () => {
  it("no scoring dice farkles: forfeits turnScore and advances", async () => {
    const code = await makeGame("ten");
    queueDice(2, 2, 3, 4, 4, 6); // no 1s/5s, no triple, not three pairs -> 0
    await rollTen({ code, byUid: "u1" });
    const g = await get(code);
    expect(g.lastResult?.outcome).toBe("farkle");
    expect(g.ten).toEqual({
      turnScore: 0,
      kept: [],
      rolledThisStep: [],
      mustChoose: false,
    });
    expect(g.current).toBe(1);
  });

  it("scoring dice present sets mustChoose and stashes the roll", async () => {
    const code = await makeGame("ten");
    queueDice(1, 5, 2, 3, 4, 6); // has 1 and 5
    await rollTen({ code, byUid: "u1" });
    const g = await get(code);
    expect(g.ten?.mustChoose).toBe(true);
    expect(g.ten?.rolledThisStep).toEqual([1, 5, 2, 3, 4, 6]);
    expect(g.current).toBe(0); // same turn
  });
});

/* ================================================================ */
/* 10,000 — bankTen                                                 */
/* ================================================================ */

describe("bankTen", () => {
  it("rejects an empty selection", async () => {
    const code = await makeGame("ten");
    queueDice(1, 5, 2, 3, 4, 6);
    await rollTen({ code, byUid: "u1" });
    await expect(bankTen({ code, byUid: "u1", keep: [] })).rejects.toThrow(
      "ALL_KEPT_MUST_SCORE",
    );
  });

  it("rejects a non-scoring kept die (NOT_SCORING_SET)", async () => {
    const code = await makeGame("ten");
    queueDice(1, 5, 2, 3, 4, 6);
    await rollTen({ code, byUid: "u1" });
    // index 2 is the value 2 -> not a scoring set on its own
    await expect(bankTen({ code, byUid: "u1", keep: [2] })).rejects.toThrow(
      "NOT_SCORING_SET",
    );
  });

  it("rejects a mixed selection where one die is dead weight", async () => {
    const code = await makeGame("ten");
    queueDice(1, 5, 2, 3, 4, 6);
    await rollTen({ code, byUid: "u1" });
    // keep a 1 (scores) and a 2 (doesn't) -> ALL_KEPT_MUST_SCORE
    await expect(bankTen({ code, byUid: "u1", keep: [0, 2] })).rejects.toThrow(
      "ALL_KEPT_MUST_SCORE",
    );
  });

  it("blocks a first bank below 1000 (NEED_1000)", async () => {
    const code = await makeGame("ten");
    queueDice(5, 2, 2, 3, 4, 6); // a single 5 scores 50
    await rollTen({ code, byUid: "u1" });
    await expect(bankTen({ code, byUid: "u1", keep: [0] })).rejects.toThrow(
      "NEED_1000",
    );
  });

  it("allows a first bank that reaches 1000 and advances", async () => {
    const code = await makeGame("ten");
    queueDice(1, 1, 1, 2, 3, 4); // triple 1s = 1000
    await rollTen({ code, byUid: "u1" });
    await bankTen({ code, byUid: "u1", keep: [0, 1, 2] });
    const g = await get(code);
    expect(g.slots[0]!.score).toBe(1000);
    expect(g.slots[0]!.onBoard).toBe(true);
    expect(g.current).toBe(1);
    expect(g.ten).toEqual({
      turnScore: 0,
      kept: [],
      rolledThisStep: [],
      mustChoose: false,
    });
  });

  it("reaching 10000 finishes the game", async () => {
    const code = await makeGame("ten");
    // Put u1 on board near the target.
    await updateGameTx(code, (doc, commit) => {
      const slots = [...doc.slots];
      slots[0] = { ...slots[0]!, score: 9500, onBoard: true };
      commit({ slots });
    });
    queueDice(1, 1, 1, 2, 3, 4); // 1000 -> 10500 capped to 10000
    await rollTen({ code, byUid: "u1" });
    await bankTen({ code, byUid: "u1", keep: [0, 1, 2] });
    const g = await get(code);
    expect(g.status).toBe("finished");
    expect(g.winner).toBe("u1");
    expect(g.slots[0]!.score).toBe(10000);
    expect(g.current).toBe(0); // did not advance
  });
});

/* ================================================================ */
/* 10,000 — rollAgainTen                                            */
/* ================================================================ */

describe("rollAgainTen", () => {
  it("keeps scoring dice, rerolls the rest, accrues turnScore", async () => {
    const code = await makeGame("ten");
    queueDice(1, 5, 2, 3, 4, 6); // 1 -> 100, 5 -> 50
    await rollTen({ code, byUid: "u1" });
    // keep the single 1 (100), reroll remaining 5 dice
    queueDice(5, 2, 3, 4, 6); // reroll has a 5 -> not a farkle
    await rollAgainTen({ code, byUid: "u1", keep: [0] });
    const g = await get(code);
    expect(g.ten?.turnScore).toBe(100);
    expect(g.ten?.kept).toEqual([1]);
    expect(g.ten?.mustChoose).toBe(true);
    expect(g.ten?.rolledThisStep).toEqual([5, 2, 3, 4, 6]);
    expect(g.current).toBe(0); // same turn
  });

  it("hot dice: keeping all six rerolls a fresh six", async () => {
    const code = await makeGame("ten");
    queueDice(1, 1, 1, 5, 5, 5); // triple 1s (1000) + triple 5s (500)
    await rollTen({ code, byUid: "u1" });
    queueDice(1, 5, 2, 2, 3, 4); // hot-dice reroll of all 6, scores
    await rollAgainTen({ code, byUid: "u1", keep: [0, 1, 2, 3, 4, 5] });
    const g = await get(code);
    expect(g.ten?.turnScore).toBe(1500);
    expect(g.ten?.kept).toEqual([]); // reset for hot dice
    expect(g.ten?.rolledThisStep).toEqual([1, 5, 2, 2, 3, 4]);
    expect(g.ten?.mustChoose).toBe(true);
  });

  it("reroll farkles: forfeits turnScore and advances", async () => {
    const code = await makeGame("ten");
    queueDice(1, 2, 3, 4, 6, 6); // single 1 scores
    await rollTen({ code, byUid: "u1" });
    queueDice(2, 3, 4, 6, 6); // reroll of 5 dice, no score -> farkle
    await rollAgainTen({ code, byUid: "u1", keep: [0] });
    const g = await get(code);
    expect(g.lastResult?.outcome).toBe("farkle");
    expect(g.ten).toEqual({
      turnScore: 0,
      kept: [],
      rolledThisStep: [],
      mustChoose: false,
    });
    expect(g.current).toBe(1);
  });

  it("accumulates turnScore across a roll-again then a bank", async () => {
    const code = await makeGame("ten");
    queueDice(1, 1, 1, 2, 3, 4); // triple 1s = 1000
    await rollTen({ code, byUid: "u1" });
    queueDice(5, 2, 3); // reroll the 3 non-1 dice
    await rollAgainTen({ code, byUid: "u1", keep: [0, 1, 2] });
    const mid = await get(code);
    expect(mid.ten?.turnScore).toBe(1000);
    expect(mid.ten?.kept).toEqual([1, 1, 1]);
    // bank the 5 (50) -> total 1050, on board
    await bankTen({ code, byUid: "u1", keep: [0] });
    const g = await get(code);
    expect(g.slots[0]!.score).toBe(1050);
    expect(g.slots[0]!.onBoard).toBe(true);
  });
});
