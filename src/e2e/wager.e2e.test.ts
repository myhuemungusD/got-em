/**
 * End-to-end wager flow against the in-memory mock backend.
 *
 * Exercises the full lock -> (settle | refund) lifecycle plus the roster/
 * double-spend guards that protect a locked pot: a locked wager freezes joins,
 * leaves, and re-locks; settlement and refund are each one-shot.
 *
 * settlePot needs a finished game with a recorded winner; we use the sanctioned
 * `updateGameTx` reducer to mark the game finished (the same seam the gameplay
 * ops use), never a raw write.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  createRoom,
  joinRoom,
  startGame,
  leaveGame,
  lockWagers,
  settlePot,
  refundWagers,
  updateGameTx,
  readGame,
} from "../firebase";
import { STARTING_CHIPS } from "../firebase/ops";
import { __resetMock } from "../firebase/mock";

beforeEach(() => {
  __resetMock();
});

/**
 * Two seated players (u1 host in slot 0, u2 in slot 1) still in the lobby.
 * A 3-seat room is used so the second join does NOT auto-start the game —
 * lockWagers requires `status === "waiting"`. Slot 2 stays open.
 */
async function lobby2(): Promise<string> {
  const code = await createRoom({
    mode: "craps",
    numPlayers: 3,
    hostUid: "u1",
    hostName: "Alice",
  });
  await joinRoom({ code, slotIdx: 1, uid: "u2", name: "Bob" });
  return code;
}

async function get(code: string) {
  const doc = await readGame(code);
  if (!doc) throw new Error(`game ${code} not found`);
  return doc;
}

describe("wager flow", () => {
  it("lockWagers deducts the buy-in from all seated players and creates the pot", async () => {
    const code = await lobby2();
    await lockWagers({ code, hostUid: "u1", amount: 20 });

    const g = await get(code);
    expect(g.slots[0]!.chips).toBe(STARTING_CHIPS - 20); // 80
    expect(g.slots[1]!.chips).toBe(STARTING_CHIPS - 20); // 80
    expect(g.wager).not.toBeNull();
    expect(g.wager!.total).toBe(40);
    expect(g.wager!.amount).toBe(20);
    expect(g.wager!.settled).toBe(false);
    expect(g.wager!.paidTo).toBeNull();
    expect(g.wager!.contributions).toEqual({ u1: 20, u2: 20 });
  });

  it("settlePot credits the entire pot to the winner", async () => {
    const code = await lobby2();
    await lockWagers({ code, hostUid: "u1", amount: 20 });
    await startGame({ code, hostUid: "u1" });

    // Finish the game with u2 as winner via the sanctioned reducer.
    await updateGameTx(code, (_g, commit) => {
      commit({ status: "finished", winner: "u2" });
    });

    await settlePot({ code });
    const g = await get(code);
    // u2 staked 20 (now at 80) then collects the 40 pot -> 120.
    expect(g.slots[1]!.chips).toBe(STARTING_CHIPS - 20 + 40); // 120
    expect(g.slots[0]!.chips).toBe(STARTING_CHIPS - 20); // 80, unchanged
    expect(g.wager!.settled).toBe(true);
    expect(g.wager!.paidTo).toBe("u2");
  });

  it("refundWagers returns each contribution and marks the pot settled with no payee", async () => {
    const code = await lobby2();
    await lockWagers({ code, hostUid: "u1", amount: 20 });

    await refundWagers({ code });
    const g = await get(code);
    expect(g.slots[0]!.chips).toBe(STARTING_CHIPS); // 100 restored
    expect(g.slots[1]!.chips).toBe(STARTING_CHIPS); // 100 restored
    expect(g.wager!.settled).toBe(true);
    expect(g.wager!.paidTo).toBeNull();
  });

  it("rejects a second lockWagers (WAGER_LOCKED)", async () => {
    const code = await lobby2();
    await lockWagers({ code, hostUid: "u1", amount: 20 });
    await expect(
      lockWagers({ code, hostUid: "u1", amount: 10 }),
    ).rejects.toThrow("WAGER_LOCKED");
  });

  it("rejects joinRoom after a wager is locked (WAGER_LOCKED)", async () => {
    // Three-seat room so there is an open slot after u1/u2 lock.
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "Alice",
    });
    await joinRoom({ code, slotIdx: 1, uid: "u2", name: "Bob" });
    await lockWagers({ code, hostUid: "u1", amount: 20 });
    await expect(
      joinRoom({ code, slotIdx: 2, uid: "u3", name: "Cara" }),
    ).rejects.toThrow("WAGER_LOCKED");
  });

  it("rejects leaveGame after a wager is locked (WAGER_LOCKED)", async () => {
    const code = await lobby2();
    await lockWagers({ code, hostUid: "u1", amount: 20 });
    await expect(leaveGame({ code, uid: "u2" })).rejects.toThrow("WAGER_LOCKED");
  });

  it("rejects settlePot after a refund (ALREADY_SETTLED)", async () => {
    const code = await lobby2();
    await lockWagers({ code, hostUid: "u1", amount: 20 });
    await refundWagers({ code });

    // Even if the game later finishes, the pot is already settled (refunded).
    await startGame({ code, hostUid: "u1" });
    await updateGameTx(code, (_g, commit) => {
      commit({ status: "finished", winner: "u1" });
    });
    await expect(settlePot({ code })).rejects.toThrow("ALREADY_SETTLED");
  });
});
