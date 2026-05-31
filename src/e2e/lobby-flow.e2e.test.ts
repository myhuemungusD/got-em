/**
 * End-to-end lobby flow against the in-memory mock backend.
 *
 * Covers room creation defaults, slot filling + roster tracking, the
 * SLOT_TAKEN guard, host-initiated start, leaving a slot, and the
 * auto-start that fires when the final seat fills.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  createRoom,
  joinRoom,
  startGame,
  leaveGame,
  readGame,
} from "../firebase";
import { STARTING_CHIPS } from "../firebase/ops";
import { __resetMock } from "../firebase/mock";

beforeEach(() => {
  __resetMock();
});

async function get(code: string) {
  const doc = await readGame(code);
  if (!doc) throw new Error(`game ${code} not found`);
  return doc;
}

describe("lobby flow", () => {
  it("creates a waiting room with the correct initial state", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 2,
      hostUid: "u1",
      hostName: "Alice",
    });

    const g = await get(code);
    expect(g.status).toBe("waiting");
    expect(g.mode).toBe("craps");
    expect(g.numSlots).toBe(2);
    expect(g.slots.length).toBe(2);
    expect(g.slots[0]!.uid).toBe("u1");
    expect(g.slots[0]!.name).toBe("Alice");
    expect(g.slots[1]!.uid).toBeNull();
    expect(g.hostUid).toBe("u1");
    expect(g.current).toBe(0);
    expect(g.winner).toBeNull();
    expect(g.playerUids).toEqual(["u1"]);
    expect(g.slots[0]!.chips).toBe(STARTING_CHIPS);
  });

  it("joining fills a slot and adds the player to playerUids", async () => {
    // Three-seat room so a single join doesn't auto-start.
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "Alice",
    });
    await joinRoom({ code, slotIdx: 1, uid: "u2", name: "Bob" });

    const g = await get(code);
    expect(g.slots[1]!.uid).toBe("u2");
    expect(g.slots[1]!.name).toBe("Bob");
    expect(g.playerUids).toEqual(["u1", "u2"]);
    expect(g.status).toBe("waiting"); // not full yet
  });

  it("cannot join a slot already taken (SLOT_TAKEN)", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "Alice",
    });
    // Slot 0 is the host's seat — claiming it as a new uid is rejected.
    await expect(
      joinRoom({ code, slotIdx: 0, uid: "u9", name: "Mallory" }),
    ).rejects.toThrow("SLOT_TAKEN");
  });

  it("startGame transitions to in_progress with the first player's turn", async () => {
    // Create a 3-seat room, fill two, then host starts (compacts to 2 seats).
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "Alice",
    });
    await joinRoom({ code, slotIdx: 1, uid: "u2", name: "Bob" });
    await startGame({ code, hostUid: "u1" });

    const g = await get(code);
    expect(g.status).toBe("in_progress");
    expect(g.current).toBe(0);
    expect(g.numSlots).toBe(2); // compacted to filled seats
    expect(g.slots.length).toBe(2);
    expect(g.turnStartedAt).not.toBeNull();
    expect(g.turnDeadline).not.toBeNull();
  });

  it("leaveGame removes the player from their slot", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "Alice",
    });
    await joinRoom({ code, slotIdx: 1, uid: "u2", name: "Bob" });

    await leaveGame({ code, uid: "u2" });
    const g = await get(code);
    expect(g.slots[1]!.uid).toBeNull();
    expect(g.slots[1]!.name).toBe("");
    expect(g.playerUids).toEqual(["u1"]);
    expect(g.status).toBe("waiting");
  });

  it("auto-starts the game when the final slot fills", async () => {
    // 2-seat room: host holds slot 0, the join of slot 1 fills the room and
    // should flip status straight to in_progress without an explicit start.
    const code = await createRoom({
      mode: "craps",
      numPlayers: 2,
      hostUid: "u1",
      hostName: "Alice",
    });
    await joinRoom({ code, slotIdx: 1, uid: "u2", name: "Bob" });

    const g = await get(code);
    expect(g.status).toBe("in_progress");
    expect(g.current).toBe(0);
    expect(g.turnStartedAt).not.toBeNull();
    expect(g.turnDeadline).not.toBeNull();
  });
});
