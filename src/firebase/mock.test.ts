import { describe, it, expect, beforeEach } from "vitest";
import {
  createRoom,
  joinRoom,
  startGame,
  leaveGame,
  readGame,
  subscribeGame,
  updateGameTx,
  TEST_MODE,
} from "./index";
import { __resetMock, __getMockStore, __getMockListenerCount } from "./mock";
import type { GameDoc } from "./types";

beforeEach(() => {
  __resetMock();
});

describe("firebase/mode", () => {
  it("auto-derives TEST_MODE=true under vitest", () => {
    expect(TEST_MODE).toBe(true);
  });
});

describe("createRoom", () => {
  it("creates a games/{code} doc with the canonical initial shape", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "Alice",
    });
    expect(code).toMatch(/^[A-Z2-9]{4}$/);
    const stored = __getMockStore().get(`games/${code}`) as unknown as GameDoc;
    expect(stored).toBeDefined();
    expect(stored.code).toBe(code);
    expect(stored.mode).toBe("craps");
    expect(stored.hostUid).toBe("u1");
    expect(stored.status).toBe("waiting");
    expect(stored.numSlots).toBe(3);
    expect(stored.slots).toHaveLength(3);
    expect(stored.slots[0]).toEqual({
      uid: "u1",
      name: "Alice",
      score: 0,
      onBoard: false,
      chips: 100,
    });
    expect(stored.slots[1]!.uid).toBeNull();
    expect(stored.playerUids).toEqual(["u1"]);
    expect(stored.craps).toEqual({ phase: "comeout", point: null });
    expect(stored.turnStartedAt).toBeNull();
    expect(stored.turnDeadline).toBeNull();
    expect(stored.turnDurationMs).toBe(30000);
  });

  it("seeds every slot with the starting chip stack and no locked wager", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "Alice",
    });
    const stored = (await readGame(code)) as GameDoc;
    expect(stored.wager).toBeNull();
    expect(stored.slots).toHaveLength(3);
    for (const slot of stored.slots) {
      expect(slot.chips).toBe(100);
    }
  });

  it("seeds mode-specific substate", async () => {
    const cloCode = await createRoom({
      mode: "clo",
      numPlayers: 2,
      hostUid: "u1",
      hostName: "A",
    });
    const tenCode = await createRoom({
      mode: "ten",
      numPlayers: 2,
      hostUid: "u1",
      hostName: "A",
    });
    const s456Code = await createRoom({
      mode: "s456",
      numPlayers: 2,
      hostUid: "u1",
      hostName: "A",
    });
    const clo = (await readGame(cloCode)) as GameDoc;
    const ten = (await readGame(tenCode)) as GameDoc;
    const s456 = (await readGame(s456Code)) as GameDoc;
    expect(clo.matchup).toEqual({ rolls: {} });
    expect(s456.matchup).toEqual({ rolls: {} });
    expect(ten.ten).toEqual({
      turnScore: 0,
      kept: [],
      rolledThisStep: [],
      mustChoose: false,
    });
  });
});

describe("joinRoom", () => {
  it("fills an open slot and updates playerUids", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "Alice",
    });
    await joinRoom({ code, slotIdx: 1, uid: "u2", name: "Bob" });
    const doc = (await readGame(code)) as GameDoc;
    expect(doc.slots[1]).toEqual({
      uid: "u2",
      name: "Bob",
      score: 0,
      onBoard: false,
      chips: 100,
    });
    expect(doc.playerUids).toEqual(["u1", "u2"]);
    expect(doc.status).toBe("waiting");
  });

  it("flips status to in_progress once all slots are filled", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 2,
      hostUid: "u1",
      hostName: "A",
    });
    await joinRoom({ code, slotIdx: 1, uid: "u2", name: "B" });
    const doc = (await readGame(code)) as GameDoc;
    expect(doc.status).toBe("in_progress");
    expect(doc.turnStartedAt).not.toBeNull();
    expect(doc.turnDeadline).toBe(
      (doc.turnStartedAt as number) + doc.turnDurationMs,
    );
  });

  it("is idempotent for a player already in the room", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "A",
    });
    await joinRoom({ code, slotIdx: 1, uid: "u2", name: "B" });
    await joinRoom({ code, slotIdx: 2, uid: "u2", name: "B" });
    const doc = (await readGame(code)) as GameDoc;
    expect(doc.playerUids).toEqual(["u1", "u2"]);
    expect(doc.slots[2]!.uid).toBeNull();
  });

  it("throws ROOM_NOT_FOUND for an unknown code", async () => {
    await expect(
      joinRoom({ code: "ZZZZ", slotIdx: 0, uid: "u1", name: "A" }),
    ).rejects.toThrow("ROOM_NOT_FOUND");
  });

  it("throws SLOT_TAKEN when slot is occupied", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "A",
    });
    await joinRoom({ code, slotIdx: 1, uid: "u2", name: "B" });
    await expect(
      joinRoom({ code, slotIdx: 1, uid: "u3", name: "C" }),
    ).rejects.toThrow("SLOT_TAKEN");
  });

  it("throws BAD_SLOT for an out-of-range index", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 2,
      hostUid: "u1",
      hostName: "A",
    });
    await expect(
      joinRoom({ code, slotIdx: 9, uid: "u2", name: "B" }),
    ).rejects.toThrow("BAD_SLOT");
  });
});

describe("startGame", () => {
  it("compacts filled slots and moves to in_progress", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 4,
      hostUid: "u1",
      hostName: "A",
    });
    await joinRoom({ code, slotIdx: 2, uid: "u3", name: "C" });
    await startGame({ code, hostUid: "u1" });
    const doc = (await readGame(code)) as GameDoc;
    expect(doc.status).toBe("in_progress");
    expect(doc.numSlots).toBe(2);
    expect(doc.slots.map((s) => s.uid)).toEqual(["u1", "u3"]);
    expect(doc.playerUids).toEqual(["u1", "u3"]);
    expect(doc.turnStartedAt).not.toBeNull();
    expect(doc.turnDeadline).toBe(
      (doc.turnStartedAt as number) + doc.turnDurationMs,
    );
  });

  it("rejects non-host", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "A",
    });
    await joinRoom({ code, slotIdx: 1, uid: "u2", name: "B" });
    await expect(startGame({ code, hostUid: "u2" })).rejects.toThrow("NOT_HOST");
  });

  it("rejects when fewer than 2 players are seated", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "A",
    });
    await expect(startGame({ code, hostUid: "u1" })).rejects.toThrow(
      "TOO_FEW_PLAYERS",
    );
  });
});

describe("leaveGame", () => {
  it("clears the leaver's slot and removes them from playerUids", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "A",
    });
    await joinRoom({ code, slotIdx: 1, uid: "u2", name: "B" });
    await leaveGame({ code, uid: "u2" });
    const doc = (await readGame(code)) as GameDoc;
    expect(doc.slots[1]!.uid).toBeNull();
    expect(doc.playerUids).toEqual(["u1"]);
  });

  it("promotes a new host when the host leaves", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "A",
    });
    await joinRoom({ code, slotIdx: 1, uid: "u2", name: "B" });
    await leaveGame({ code, uid: "u1" });
    const doc = (await readGame(code)) as GameDoc;
    expect(doc.hostUid).toBe("u2");
  });

  it("deletes the doc when the last player leaves", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "u1",
      hostName: "A",
    });
    await leaveGame({ code, uid: "u1" });
    expect(__getMockStore().get(`games/${code}`)).toBeUndefined();
  });
});

describe("subscribeGame", () => {
  it("fires once immediately with current state, then on every write", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 2,
      hostUid: "u1",
      hostName: "A",
    });
    const seen: (GameDoc | undefined)[] = [];
    const unsub = subscribeGame(code, (doc) => {
      seen.push(doc);
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.code).toBe(code);

    await joinRoom({ code, slotIdx: 1, uid: "u2", name: "B" });
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[seen.length - 1]?.playerUids).toEqual(["u1", "u2"]);

    unsub();
    expect(__getMockListenerCount(`games/${code}`)).toBe(0);

    const lenBeforeFurtherWrite = seen.length;
    await updateGameTx(code, (_doc, commit) => {
      commit({ winner: "u1" });
    });
    expect(seen.length).toBe(lenBeforeFurtherWrite);
  });
});

describe("updateGameTx", () => {
  it("delivers the latest doc to the reducer and stamps updatedAt", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 2,
      hostUid: "u1",
      hostName: "A",
    });
    const before = (await readGame(code)) as GameDoc;
    await new Promise((r) => setTimeout(r, 2));
    let observedCode: string | undefined;
    await updateGameTx(code, (doc, commit) => {
      observedCode = doc.code;
      commit({ current: 1 });
    });
    expect(observedCode).toBe(code);
    const after = (await readGame(code)) as GameDoc;
    expect(after.current).toBe(1);
    expect(Number(after.updatedAt)).toBeGreaterThanOrEqual(
      Number(before.updatedAt),
    );
  });

  it("throws ROOM_NOT_FOUND if the doc is missing", async () => {
    await expect(
      updateGameTx("MISS", (_doc, commit) => commit({ current: 0 })),
    ).rejects.toThrow("ROOM_NOT_FOUND");
  });

  it("serializes concurrent transactions so neither loses the other's write", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 2,
      hostUid: "u1",
      hostName: "A",
    });
    // Two concurrent txs each bump `current` by 1. With proper serialization
    // the second tx sees the first's write and the final value is 2.
    const bump = (): Promise<void> =>
      updateGameTx(code, (doc, commit) => {
        commit({ current: doc.current + 1 });
      });
    await Promise.all([bump(), bump()]);
    const after = (await readGame(code)) as GameDoc;
    expect(after.current).toBe(2);
  });

  it("a thrown reducer does not wedge subsequent transactions", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 2,
      hostUid: "u1",
      hostName: "A",
    });
    await expect(
      updateGameTx(code, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await updateGameTx(code, (_doc, commit) => commit({ current: 7 }));
    const after = (await readGame(code)) as GameDoc;
    expect(after.current).toBe(7);
  });
});
