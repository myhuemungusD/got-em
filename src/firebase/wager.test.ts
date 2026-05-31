import { describe, it, expect, beforeEach } from "vitest";
import {
  createRoom,
  joinRoom,
  startGame,
  readGame,
  lockWagers,
} from "./index";
import { __resetMock } from "./mock";
import type { GameDoc } from "./types";

beforeEach(() => {
  __resetMock();
});

/** Seed a 2-player waiting room with both slots filled, still in lobby. */
async function lobbyOfTwo(): Promise<string> {
  const code = await createRoom({
    mode: "craps",
    numPlayers: 3,
    hostUid: "u1",
    hostName: "Alice",
  });
  await joinRoom({ code, slotIdx: 1, uid: "u2", name: "Bob" });
  return code;
}

describe("lockWagers", () => {
  it("deducts the buy-in from each occupied slot and builds the pot", async () => {
    const code = await lobbyOfTwo();
    await lockWagers({ code, hostUid: "u1", amount: 25 });
    const doc = (await readGame(code)) as GameDoc;

    expect(doc.slots[0].chips).toBe(75);
    expect(doc.slots[1].chips).toBe(75);
    // Empty slot untouched.
    expect(doc.slots[2].uid).toBeNull();
    expect(doc.slots[2].chips).toBe(100);

    expect(doc.wager).toEqual({
      amount: 25,
      contributions: { u1: 25, u2: 25 },
      total: 50,
      settled: false,
      paidTo: null,
    });
  });

  it("allows a zero buy-in (no chips moved, pot total 0)", async () => {
    const code = await lobbyOfTwo();
    await lockWagers({ code, hostUid: "u1", amount: 0 });
    const doc = (await readGame(code)) as GameDoc;
    expect(doc.slots[0].chips).toBe(100);
    expect(doc.wager?.total).toBe(0);
  });

  it("rejects a buy-in larger than a seated player's stack", async () => {
    const code = await lobbyOfTwo();
    await expect(
      lockWagers({ code, hostUid: "u1", amount: 150 }),
    ).rejects.toThrow("INSUFFICIENT_CHIPS");
    const doc = (await readGame(code)) as GameDoc;
    expect(doc.wager).toBeNull();
    expect(doc.slots[0].chips).toBe(100);
  });

  it("rejects a negative buy-in", async () => {
    const code = await lobbyOfTwo();
    await expect(
      lockWagers({ code, hostUid: "u1", amount: -5 }),
    ).rejects.toThrow("INSUFFICIENT_CHIPS");
  });

  it("rejects a non-host caller", async () => {
    const code = await lobbyOfTwo();
    await expect(
      lockWagers({ code, hostUid: "u2", amount: 10 }),
    ).rejects.toThrow("NOT_HOST");
  });

  it("rejects a double-lock with WAGER_LOCKED", async () => {
    const code = await lobbyOfTwo();
    await lockWagers({ code, hostUid: "u1", amount: 10 });
    await expect(
      lockWagers({ code, hostUid: "u1", amount: 5 }),
    ).rejects.toThrow("WAGER_LOCKED");
  });

  it("rejects locking after the game has started", async () => {
    const code = await lobbyOfTwo();
    await startGame({ code, hostUid: "u1" });
    await expect(
      lockWagers({ code, hostUid: "u1", amount: 10 }),
    ).rejects.toThrow("ALREADY_STARTED");
  });

  it("throws ROOM_NOT_FOUND for an unknown code", async () => {
    await expect(
      lockWagers({ code: "ZZZZ", hostUid: "u1", amount: 10 }),
    ).rejects.toThrow("ROOM_NOT_FOUND");
  });
});
