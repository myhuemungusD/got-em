import { describe, it, expect, beforeEach } from "vitest";
import {
  createRoom,
  joinRoom,
  startGame,
  readGame,
  updateGameTx,
  lockWagers,
  settlePot,
  refundWagers,
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

/** Force a room to a terminal state via the sanctioned tx path. */
async function finish(code: string, winner: string | null): Promise<void> {
  await updateGameTx(code, (_doc, commit) => {
    commit({ status: "finished", winner });
  });
}

describe("lockWagers", () => {
  it("deducts the buy-in from each occupied slot and builds the pot", async () => {
    const code = await lobbyOfTwo();
    await lockWagers({ code, hostUid: "u1", amount: 25 });
    const doc = (await readGame(code)) as GameDoc;

    expect(doc.slots[0]!.chips).toBe(75);
    expect(doc.slots[1]!.chips).toBe(75);
    // Empty slot untouched.
    expect(doc.slots[2]!.uid).toBeNull();
    expect(doc.slots[2]!.chips).toBe(100);

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
    expect(doc.slots[0]!.chips).toBe(100);
    expect(doc.wager?.total).toBe(0);
  });

  it("rejects a buy-in larger than a seated player's stack", async () => {
    const code = await lobbyOfTwo();
    await expect(
      lockWagers({ code, hostUid: "u1", amount: 150 }),
    ).rejects.toThrow("INSUFFICIENT_CHIPS");
    const doc = (await readGame(code)) as GameDoc;
    expect(doc.wager).toBeNull();
    expect(doc.slots[0]!.chips).toBe(100);
  });

  it("rejects a negative buy-in", async () => {
    const code = await lobbyOfTwo();
    await expect(
      lockWagers({ code, hostUid: "u1", amount: -5 }),
    ).rejects.toThrow("INVALID_WAGER");
  });

  it("rejects a NaN buy-in without mutating any chips", async () => {
    const code = await lobbyOfTwo();
    await expect(
      lockWagers({ code, hostUid: "u1", amount: Number.NaN }),
    ).rejects.toThrow("INVALID_WAGER");
    const doc = (await readGame(code)) as GameDoc;
    expect(doc.wager).toBeNull();
    expect(doc.slots[0]!.chips).toBe(100);
    expect(doc.slots[1]!.chips).toBe(100);
  });

  it("rejects a fractional buy-in", async () => {
    const code = await lobbyOfTwo();
    await expect(
      lockWagers({ code, hostUid: "u1", amount: 12.5 }),
    ).rejects.toThrow("INVALID_WAGER");
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

  it("freezes the roster: no new joiners once a wager is locked", async () => {
    // lobbyOfTwo leaves slot 2 (idx 2) open in a 3-slot room.
    const code = await lobbyOfTwo();
    await lockWagers({ code, hostUid: "u1", amount: 25 });
    await expect(
      joinRoom({ code, slotIdx: 2, uid: "u3", name: "Cara" }),
    ).rejects.toThrow("WAGER_LOCKED");
    // Pot accounting is untouched by the rejected join.
    const doc = (await readGame(code)) as GameDoc;
    expect(doc.wager?.total).toBe(50);
    expect(doc.playerUids).toEqual(["u1", "u2"]);
  });

  it("throws ROOM_NOT_FOUND for an unknown code", async () => {
    await expect(
      lockWagers({ code: "ZZZZ", hostUid: "u1", amount: 10 }),
    ).rejects.toThrow("ROOM_NOT_FOUND");
  });
});

describe("settlePot", () => {
  it("pays the full pot to the winner and flips settled/paidTo", async () => {
    const code = await lobbyOfTwo();
    await lockWagers({ code, hostUid: "u1", amount: 25 }); // both at 75, pot 50
    await finish(code, "u2");
    await settlePot({ code });
    const doc = (await readGame(code)) as GameDoc;

    expect(doc.slots[0]!.chips).toBe(75); // loser unchanged
    expect(doc.slots[1]!.chips).toBe(125); // winner 75 + pot 50
    expect(doc.wager?.settled).toBe(true);
    expect(doc.wager?.paidTo).toBe("u2");
  });

  it("is idempotent — a second settle throws ALREADY_SETTLED", async () => {
    const code = await lobbyOfTwo();
    await lockWagers({ code, hostUid: "u1", amount: 25 });
    await finish(code, "u2");
    await settlePot({ code });
    await expect(settlePot({ code })).rejects.toThrow("ALREADY_SETTLED");
    const doc = (await readGame(code)) as GameDoc;
    // Winner not paid twice.
    expect(doc.slots[1]!.chips).toBe(125);
  });

  it("rejects when no wager is locked", async () => {
    const code = await lobbyOfTwo();
    await finish(code, "u2");
    await expect(settlePot({ code })).rejects.toThrow("WAGER_NOT_LOCKED");
  });

  it("rejects when the game is not finished", async () => {
    const code = await lobbyOfTwo();
    await lockWagers({ code, hostUid: "u1", amount: 25 });
    await expect(settlePot({ code })).rejects.toThrow("INVALID_SETTLEMENT");
  });

  it("rejects when there is no winner", async () => {
    const code = await lobbyOfTwo();
    await lockWagers({ code, hostUid: "u1", amount: 25 });
    await finish(code, null);
    await expect(settlePot({ code })).rejects.toThrow("INVALID_SETTLEMENT");
  });

  it("throws ROOM_NOT_FOUND for an unknown code", async () => {
    await expect(settlePot({ code: "ZZZZ" })).rejects.toThrow(
      "ROOM_NOT_FOUND",
    );
  });
});

describe("refundWagers", () => {
  it("returns each contribution, flips settled, leaves paidTo null", async () => {
    const code = await lobbyOfTwo();
    await lockWagers({ code, hostUid: "u1", amount: 25 }); // both at 75
    await refundWagers({ code });
    const doc = (await readGame(code)) as GameDoc;

    expect(doc.slots[0]!.chips).toBe(100);
    expect(doc.slots[1]!.chips).toBe(100);
    expect(doc.wager?.settled).toBe(true);
    expect(doc.wager?.paidTo).toBeNull();
  });

  it("is idempotent — a second refund throws ALREADY_SETTLED", async () => {
    const code = await lobbyOfTwo();
    await lockWagers({ code, hostUid: "u1", amount: 25 });
    await refundWagers({ code });
    await expect(refundWagers({ code })).rejects.toThrow("ALREADY_SETTLED");
    const doc = (await readGame(code)) as GameDoc;
    // Not refunded twice.
    expect(doc.slots[0]!.chips).toBe(100);
  });

  it("rejects when no wager is locked", async () => {
    const code = await lobbyOfTwo();
    await expect(refundWagers({ code })).rejects.toThrow("WAGER_NOT_LOCKED");
  });

  it("rejects refunding a finished game (that is settlePot's job)", async () => {
    const code = await lobbyOfTwo();
    await lockWagers({ code, hostUid: "u1", amount: 25 });
    await finish(code, "u2");
    await expect(refundWagers({ code })).rejects.toThrow("INVALID_SETTLEMENT");
  });

  it("throws ROOM_NOT_FOUND for an unknown code", async () => {
    await expect(refundWagers({ code: "ZZZZ" })).rejects.toThrow(
      "ROOM_NOT_FOUND",
    );
  });
});
