import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentSlot, isMyTurn, leaveRoom, watchRoom } from "./game-bridge";
import { resetState, setState, state } from "./state";
import type { GameStatus, Slot } from "./state";
import type { GameDoc } from "./firebase";
import {
  setDoc,
  doc as mockDoc,
  runTransaction as mockRunTransaction,
  __getMockListenerCount,
  __resetMock,
} from "./firebase/mock";

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function makeSlot(uid: string | null, name: string): Slot {
  return { uid, name, score: 0, onBoard: false, chips: 100 };
}

function makeDoc(overrides: Partial<GameDoc> = {}): GameDoc {
  return {
    v: 1,
    code: "ABCD",
    mode: "craps",
    hostUid: "u1",
    numSlots: 2,
    slots: [makeSlot("u1", "Ace"), makeSlot("u2", "Blaze")],
    playerUids: ["u1", "u2"],
    current: 0,
    status: "in_progress",
    winner: null,
    lastRoll: null,
    lastResult: null,
    lastRollId: null,
    lastRolledBy: null,
    turnStartedAt: null,
    turnDeadline: null,
    turnDurationMs: 30000,
    wager: null,
    craps: { phase: "comeout", point: null },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function write(code: string, d: GameDoc): void {
  void setDoc(mockDoc(undefined, "games", code), d as unknown as Record<string, unknown>);
}

beforeEach(() => {
  resetState();
  __resetMock();
});

afterEach(async () => {
  await leaveRoom();
});

describe("screen derivation from status", () => {
  const cases: Array<[GameStatus, string]> = [
    ["waiting", "lobby"],
    ["in_progress", "play"],
    ["finished", "gameover"],
  ];

  for (const [status, screen] of cases) {
    it(`${status} → ${screen}`, async () => {
      write("ABCD", makeDoc({ status, winner: status === "finished" ? "u1" : null }));
      watchRoom("ABCD");
      await flush();
      expect(state.screen).toBe(screen);
      expect(state.game?.status).toBe(status);
    });
  }
});

describe("doc mirroring", () => {
  it("mirrors the doc into state.game and sets currentRoom", async () => {
    write("ABCD", makeDoc({ current: 1 }));
    watchRoom("ABCD");
    await flush();
    expect(state.currentRoom).toBe("ABCD");
    expect(state.game?.current).toBe(1);
    expect(state.game?.slots).toHaveLength(2);
  });

  it("reflects later writes to the same room", async () => {
    write("ABCD", makeDoc({ status: "waiting" }));
    watchRoom("ABCD");
    await flush();
    expect(state.screen).toBe("lobby");

    write("ABCD", makeDoc({ status: "in_progress" }));
    await flush();
    expect(state.screen).toBe("play");
  });

  it("records lastConfig when a game finishes", async () => {
    write("ABCD", makeDoc({ status: "finished", mode: "ten", winner: "u1" }));
    watchRoom("ABCD");
    await flush();
    expect(state.lastConfig).toEqual({ mode: "ten", numPlayers: 2 });
  });
});

describe("isMyTurn / currentSlot", () => {
  it("isMyTurn is true when the current slot's uid matches", () => {
    const g = makeDoc({ current: 0 });
    expect(isMyTurn(g, "u1")).toBe(true);
    expect(isMyTurn(g, "u2")).toBe(false);
  });

  it("isMyTurn handles null game and null uid", () => {
    expect(isMyTurn(null, "u1")).toBe(false);
    const empty = makeDoc({ slots: [makeSlot(null, ""), makeSlot("u2", "Blaze")], current: 0 });
    expect(isMyTurn(empty, null)).toBe(true);
    expect(isMyTurn(empty, "u2")).toBe(false);
  });

  it("currentSlot returns the active slot or null", () => {
    expect(currentSlot(null)).toBeNull();
    const g = makeDoc({ current: 1 });
    expect(currentSlot(g)?.uid).toBe("u2");
  });

  it("currentSlot guards an out-of-range current", () => {
    const g = makeDoc({ current: 9 });
    expect(currentSlot(g)).toBeNull();
  });
});

describe("remote roll animation ordering", () => {
  it("awaits animateRoll BEFORE the screen cuts on a new remote roll", async () => {
    setState({ myUid: "u1", screen: "lobby" });
    write("ABCD", makeDoc({ status: "waiting" }));
    watchRoom("ABCD", { animateRoll: () => Promise.resolve() });
    await flush();
    expect(state.screen).toBe("lobby");

    let resolveAnim: (() => void) | null = null;
    const screenAtAnimTime: string[] = [];
    const animateRoll = vi.fn(() => {
      screenAtAnimTime.push(state.screen);
      return new Promise<void>((res) => {
        resolveAnim = () => res();
      });
    });

    watchRoom("ABCD", { animateRoll });
    write("ABCD", makeDoc({
      status: "in_progress",
      lastRoll: [3, 4],
      lastRollId: "r1",
      lastRolledBy: "u2",
    }));
    await flush();

    expect(animateRoll).toHaveBeenCalledWith([3, 4]);
    expect(state.isAnimatingRoll).toBe(true);
    expect(state.screen).toBe("lobby");

    resolveAnim!();
    await flush();
    expect(state.isAnimatingRoll).toBe(false);
    expect(state.screen).toBe("play");
    expect(screenAtAnimTime).toEqual(["lobby"]);
  });

  it("does not animate the client's OWN roll", async () => {
    setState({ myUid: "u1" });
    write("ABCD", makeDoc({ status: "in_progress" }));
    const animateRoll = vi.fn(() => Promise.resolve());
    watchRoom("ABCD", { animateRoll });
    await flush();

    write("ABCD", makeDoc({
      status: "in_progress",
      lastRoll: [5, 2],
      lastRollId: "r1",
      lastRolledBy: "u1",
    }));
    await flush();

    expect(animateRoll).not.toHaveBeenCalled();
    expect(state.lastSeenRollId).toBe("r1");
    expect(state.screen).toBe("play");
  });

  it("animates a remote roll only once across repeat snapshots", async () => {
    setState({ myUid: "u1" });
    write("ABCD", makeDoc({ status: "in_progress" }));
    const animateRoll = vi.fn(() => Promise.resolve());
    watchRoom("ABCD", { animateRoll });
    await flush();

    const rolled = makeDoc({
      status: "in_progress",
      lastRoll: [6, 1],
      lastRollId: "r1",
      lastRolledBy: "u2",
    });
    write("ABCD", rolled);
    await flush();
    write("ABCD", rolled);
    await flush();

    expect(animateRoll).toHaveBeenCalledTimes(1);
  });
});

describe("pendingTenSelection reset", () => {
  it("clears on a turn (current) change", async () => {
    setState({ myUid: "u1" });
    write("ABCD", makeDoc({ current: 0 }));
    watchRoom("ABCD");
    await flush();
    setState({ pendingTenSelection: [0, 2] });

    write("ABCD", makeDoc({ current: 1 }));
    await flush();
    expect(state.pendingTenSelection).toEqual([]);
  });

  it("clears on a roll id change", async () => {
    setState({ myUid: "u1" });
    write("ABCD", makeDoc({ lastRollId: "r1", lastRoll: [1, 1], lastRolledBy: "u1" }));
    watchRoom("ABCD");
    await flush();
    setState({ pendingTenSelection: [1] });

    write("ABCD", makeDoc({ lastRollId: "r2", lastRoll: [2, 2], lastRolledBy: "u1" }));
    await flush();
    expect(state.pendingTenSelection).toEqual([]);
  });

  it("leaves selection alone when neither turn nor roll changes", async () => {
    setState({ myUid: "u1" });
    write("ABCD", makeDoc({ current: 0, lastRollId: "r1", lastRolledBy: "u1" }));
    watchRoom("ABCD");
    await flush();
    setState({ pendingTenSelection: [0, 1] });

    write("ABCD", makeDoc({ current: 0, lastRollId: "r1", lastRolledBy: "u1", winner: null }));
    await flush();
    expect(state.pendingTenSelection).toEqual([0, 1]);
  });
});

describe("leaveRoom and teardown", () => {
  it("clears game/currentRoom/lastSeenRollId and goes to splash", async () => {
    setState({ myUid: "u1" });
    write("ABCD", makeDoc({ status: "in_progress", lastRollId: "r1" }));
    watchRoom("ABCD");
    await flush();
    expect(state.game).not.toBeNull();

    await leaveRoom();
    expect(state.game).toBeNull();
    expect(state.currentRoom).toBeNull();
    expect(state.lastSeenRollId).toBeNull();
    expect(state.screen).toBe("splash");
  });

  it("unsubscribes the listener on leaveRoom (no leak)", async () => {
    write("ABCD", makeDoc());
    watchRoom("ABCD");
    await flush();
    expect(__getMockListenerCount("games/ABCD")).toBe(1);
    await leaveRoom();
    expect(__getMockListenerCount("games/ABCD")).toBe(0);
  });

  it("tears down the previous watch when watchRoom is called again", async () => {
    write("ABCD", makeDoc());
    write("WXYZ", makeDoc({ code: "WXYZ" }));
    watchRoom("ABCD");
    await flush();
    watchRoom("WXYZ");
    await flush();
    expect(__getMockListenerCount("games/ABCD")).toBe(0);
    expect(__getMockListenerCount("games/WXYZ")).toBe(1);
  });

  it("a doc deletion drives the splash transition", async () => {
    setState({ myUid: "u1" });
    write("ABCD", makeDoc({ status: "in_progress" }));
    watchRoom("ABCD");
    await flush();
    expect(state.screen).toBe("play");

    await mockRunTransaction(undefined, (tx) => {
      tx.delete(mockDoc(undefined, "games", "ABCD"));
      return Promise.resolve();
    });
    await flush();

    expect(state.game).toBeNull();
    expect(state.currentRoom).toBeNull();
    expect(state.screen).toBe("splash");
  });
});
