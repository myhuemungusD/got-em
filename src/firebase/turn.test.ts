import { describe, it, expect, beforeEach } from "vitest";
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

  it("throws NOT_YOUR_TURN when the caller is not the current slot", async () => {
    const code = await makeInProgress3p();
    // current === 0 (u1), so u2 calling should be rejected.
    await expect(advanceTurn({ code, byUid: "u2" })).rejects.toThrow(
      "NOT_YOUR_TURN",
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
