import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isNpc, addNpc, clearNpcs, maybeNpcTurn, hasActiveNpcs, getActiveNpcUids } from "./npc";
import { createRoom, readGame } from "./firebase";
import { __resetMock } from "./firebase/mock";
import { setDieSource, resetDieSource } from "./scoring/dice";

beforeEach(() => {
  __resetMock();
  clearNpcs();
});

afterEach(() => {
  resetDieSource();
  clearNpcs();
});

describe("isNpc", () => {
  it("returns true for npc- prefixed uids", () => {
    expect(isNpc("npc-abc123")).toBe(true);
  });

  it("returns false for regular uids", () => {
    expect(isNpc("user-abc123")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isNpc(null)).toBe(false);
  });
});

describe("addNpc", () => {
  it("adds an NPC to an open slot", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 2,
      hostUid: "host",
      hostName: "Host",
    });

    const uid = await addNpc(code, 1);
    expect(uid).toMatch(/^npc-/);
    expect(hasActiveNpcs()).toBe(true);

    const game = await readGame(code);
    expect(game?.slots[1]?.uid).toBe(uid);
    expect(game?.slots[1]?.name).toBeTruthy();
  });

  it("auto-starts when all slots fill", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 2,
      hostUid: "host",
      hostName: "Host",
    });

    await addNpc(code, 1);
    const game = await readGame(code);
    expect(game?.status).toBe("in_progress");
  });

  it("throws SLOT_TAKEN if the slot is occupied", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 2,
      hostUid: "host",
      hostName: "Host",
    });

    await expect(addNpc(code, 0)).rejects.toThrow("SLOT_TAKEN");
  });
});

describe("clearNpcs", () => {
  it("clears all tracked NPCs", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "host",
      hostName: "Host",
    });

    await addNpc(code, 1);
    expect(hasActiveNpcs()).toBe(true);

    clearNpcs();
    expect(hasActiveNpcs()).toBe(false);
  });
});

describe("getActiveNpcUids", () => {
  it("returns uids of added NPCs", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 4,
      hostUid: "host",
      hostName: "Host",
    });

    const uid1 = await addNpc(code, 1);
    const uid2 = await addNpc(code, 2);
    const uids = getActiveNpcUids();
    expect(uids).toContain(uid1);
    expect(uids).toContain(uid2);
    expect(uids).toHaveLength(2);
  });

  it("is empty after clearNpcs", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "host",
      hostName: "Host",
    });

    await addNpc(code, 1);
    expect(getActiveNpcUids().length).toBeGreaterThan(0);

    clearNpcs();
    expect(getActiveNpcUids()).toEqual([]);
  });
});

describe("maybeNpcTurn", () => {
  it("does nothing when the game is not in progress", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "host",
      hostName: "Host",
    });
    await addNpc(code, 1);
    const game = await readGame(code);
    maybeNpcTurn(game!);
  });

  it("does nothing when the current player is not an NPC", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 2,
      hostUid: "host",
      hostName: "Host",
    });
    await addNpc(code, 1);
    const game = await readGame(code);
    expect(game?.current).toBe(0);
    maybeNpcTurn(game!);
  });

  it("schedules a craps roll when it is the NPC's turn", async () => {
    vi.useFakeTimers();

    const code = await createRoom({
      mode: "craps",
      numPlayers: 2,
      hostUid: "host",
      hostName: "Host",
    });
    const npcUid = await addNpc(code, 1);

    const game = await readGame(code);
    expect(game?.status).toBe("in_progress");
    expect(game?.current).toBe(0);

    // Simulate host rolling first (7 = win, advances turn to NPC)
    const hostDice = [3, 4];
    let hostIdx = 0;
    setDieSource(() => hostDice[hostIdx++]!);
    const { rollCraps } = await import("./firebase");
    await rollCraps({ code, byUid: "host" });

    const afterHostRoll = await readGame(code);
    expect(afterHostRoll?.current).toBe(1);
    expect(afterHostRoll?.slots[1]?.uid).toBe(npcUid);

    const npcDice = [2, 3];
    let npcIdx = 0;
    setDieSource(() => npcDice[npcIdx++]!);
    maybeNpcTurn(afterHostRoll!);

    await vi.advanceTimersByTimeAsync(2500);

    const afterNpc = await readGame(code);
    expect(afterNpc?.lastRolledBy).toBe(npcUid);

    vi.useRealTimers();
  });
});
