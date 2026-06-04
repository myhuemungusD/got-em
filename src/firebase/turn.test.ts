import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  advanceTurn,
  createRoom,
  joinRoom,
  leaveGame,
  readGame,
  startGame,
  updateGameTx,
} from "./index";
import { __resetMock } from "./mock";
import type { GameDoc } from "./types";

beforeEach(() => {
  __resetMock();
});

/**
 * Build a fully-seated, in-progress 3-player craps game and return its code.
 * Created with `numPlayers: 4` so that `startGame` exercises the compaction
 * path and we still get a 3-slot in-progress doc.
 */
async function makeInProgress3p(): Promise<string> {
  const code = await createRoom({
    mode: "craps",
    numPlayers: 4,
    hostUid: "u1",
    hostName: "Alice",
  });
  await joinRoom({ code, slotIdx: 1, uid: "u2", name: "Bob" });
  await joinRoom({ code, slotIdx: 2, uid: "u3", name: "Carol" });
  await startGame({ code, hostUid: "u1" });
  return code;
}

describe("advanceTurn", () => {
  it("advances current by 1 and stamps fresh turn deadlines", async () => {
    const code = await makeInProgress3p();
    const before = (await readGame(code)) as GameDoc;
    expect(before.current).toBe(0);
    const beforeStartedAt = before.turnStartedAt as number;

    // Force at least 1ms to pass so the new turnStartedAt is observably later.
    await new Promise((r) => setTimeout(r, 2));

    await advanceTurn({ code, byUid: "u1" });

    const after = (await readGame(code)) as GameDoc;
    expect(after.current).toBe(1);
    expect(after.turnStartedAt).not.toBeNull();
    expect(after.turnStartedAt as number).toBeGreaterThanOrEqual(
      beforeStartedAt,
    );
    expect(after.turnDeadline).toBe(
      (after.turnStartedAt as number) + after.turnDurationMs,
    );
  });

  it("wraps around from the last slot back to 0", async () => {
    const code = await makeInProgress3p();
    // Hand-set current to the final slot using the sanctioned tx helper.
    await updateGameTx(code, (_doc, commit) => {
      commit({ current: 2 });
    });

    await advanceTurn({ code, byUid: "u3" });

    const after = (await readGame(code)) as GameDoc;
    expect(after.current).toBe(0);
  });

  it("throws TURN_NOT_EXPIRED when a non-current seated player advances early", async () => {
    const code = await makeInProgress3p();
    // current === 0 (u1), turnDeadline is ~30s in the future. u2 is seated
    // but not current; the deadline has not lapsed, so the call is rejected.
    await expect(advanceTurn({ code, byUid: "u2" })).rejects.toThrow(
      "TURN_NOT_EXPIRED",
    );
  });

  it("throws NOT_IN_PROGRESS when the game is still waiting", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "A",
    });
    await expect(advanceTurn({ code, byUid: "u1" })).rejects.toThrow(
      "NOT_IN_PROGRESS",
    );
  });

  it("throws NOT_IN_PROGRESS when the game is finished", async () => {
    const code = await makeInProgress3p();
    await updateGameTx(code, (_doc, commit) => {
      commit({ status: "finished", winner: "u1" });
    });
    await expect(advanceTurn({ code, byUid: "u1" })).rejects.toThrow(
      "NOT_IN_PROGRESS",
    );
  });

  it("throws ROOM_NOT_FOUND when no game doc exists", async () => {
    await expect(advanceTurn({ code: "ZZZZ", byUid: "u1" })).rejects.toThrow(
      "ROOM_NOT_FOUND",
    );
  });

  it("leaves slots, scores, and lastRoll untouched", async () => {
    const code = await makeInProgress3p();
    const before = (await readGame(code)) as GameDoc;

    await advanceTurn({ code, byUid: "u1" });

    const after = (await readGame(code)) as GameDoc;
    expect(after.slots).toEqual(before.slots);
    expect(after.lastRoll).toEqual(before.lastRoll);
    expect(after.lastResult).toEqual(before.lastResult);
    expect(after.lastRollId).toEqual(before.lastRollId);
    expect(after.lastRolledBy).toEqual(before.lastRolledBy);
    // Unused but referenced to avoid lint complaints if leaveGame import drifts.
    void leaveGame;
  });
});

describe("advanceTurn deadline-based auto-advance", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws TURN_NOT_EXPIRED when a non-current player advances before deadline", async () => {
    const code = await makeInProgress3p();
    const g = (await readGame(code)) as GameDoc;
    const deadline = g.turnDeadline as number;
    vi.useFakeTimers();
    vi.setSystemTime(deadline - 1000);
    await expect(advanceTurn({ code, byUid: "u2" })).rejects.toThrow(
      "TURN_NOT_EXPIRED",
    );
  });

  it("lets any seated non-current player advance once the deadline has passed", async () => {
    const code = await makeInProgress3p();
    const g = (await readGame(code)) as GameDoc;
    const deadline = g.turnDeadline as number;

    vi.useFakeTimers();
    vi.setSystemTime(deadline + 5);

    await advanceTurn({ code, byUid: "u3" });

    const after = (await readGame(code)) as GameDoc;
    expect(after.current).toBe(1);
    expect(after.turnDeadline).toBe(
      (after.turnStartedAt as number) + after.turnDurationMs,
    );
  });

  it("advances exactly once when two clients race after expiry", async () => {
    const code = await makeInProgress3p();
    const g = (await readGame(code)) as GameDoc;
    const deadline = g.turnDeadline as number;

    vi.useFakeTimers();
    vi.setSystemTime(deadline + 5);

    await advanceTurn({ code, byUid: "u2" });
    const mid = (await readGame(code)) as GameDoc;
    expect(mid.current).toBe(1);

    // u3 lost the race: current is now u2 (slot 1), and the new deadline is
    // 30s in the future relative to our fake clock. u3 is non-current with
    // a fresh deadline → TURN_NOT_EXPIRED (or NOT_YOUR_TURN if order differs).
    await expect(advanceTurn({ code, byUid: "u3" })).rejects.toThrow(
      /NOT_YOUR_TURN|TURN_NOT_EXPIRED/,
    );

    const after = (await readGame(code)) as GameDoc;
    expect(after.current).toBe(1);
  });

  it("rejects callers who are not seated in the room", async () => {
    const code = await makeInProgress3p();
    const g = (await readGame(code)) as GameDoc;
    vi.useFakeTimers();
    vi.setSystemTime((g.turnDeadline as number) + 5000);
    await expect(advanceTurn({ code, byUid: "uX" })).rejects.toThrow(
      "NOT_YOUR_TURN",
    );
  });

  it("resets craps point on timeout so the next player gets a fresh come-out", async () => {
    const code = await makeInProgress3p();
    // Force the current player into the point phase so a leak would be visible.
    await updateGameTx(code, (_doc, commit) => {
      commit({ craps: { phase: "point", point: 6 } });
    });
    const g = (await readGame(code)) as GameDoc;
    vi.useFakeTimers();
    vi.setSystemTime((g.turnDeadline as number) + 5);
    await advanceTurn({ code, byUid: "u2" });
    const after = (await readGame(code)) as GameDoc;
    expect(after.craps).toEqual({ phase: "comeout", point: null });
    expect(after.current).toBe(1);
  });

  it("resets ten turn state on timeout so the next player can't bank inherited dice", async () => {
    const code = await makeInProgress3p();
    // Switch room to ten mode and seed an in-progress mustChoose state.
    await updateGameTx(code, (_doc, commit) => {
      commit({
        mode: "ten",
        ten: {
          turnScore: 200,
          kept: [1, 5],
          rolledThisStep: [1, 5, 2, 3, 4, 6],
          mustChoose: true,
        },
      });
    });
    const g = (await readGame(code)) as GameDoc;
    vi.useFakeTimers();
    vi.setSystemTime((g.turnDeadline as number) + 5);
    await advanceTurn({ code, byUid: "u2" });
    const after = (await readGame(code)) as GameDoc;
    expect(after.ten).toEqual({
      turnScore: 0,
      kept: [],
      rolledThisStep: [],
      mustChoose: false,
    });
    expect(after.current).toBe(1);
  });
});
