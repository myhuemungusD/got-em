import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  rememberRoom,
  getRecentRooms,
  forgetRoom,
  rememberChallengers,
  getRecentChallengers,
  timeAgo,
} from "./recent";
import type { GameState, Slot } from "./state";

const ROOMS_KEY = "streetdice.recentRooms";
const CHALLENGERS_KEY = "streetdice.recentChallengers";
const DAY = 24 * 60 * 60 * 1000;

function slot(over: Partial<Slot>): Slot {
  return { uid: null, name: "", score: 0, onBoard: false, chips: 100, ...over };
}

function game(over: Partial<GameState>): GameState {
  return {
    v: 1,
    code: "ABCD",
    mode: "craps",
    hostUid: "h",
    numSlots: 2,
    slots: [],
    playerUids: [],
    current: 0,
    status: "finished",
    winner: null,
    lastRoll: null,
    lastResult: null,
    lastRollId: null,
    lastRolledBy: null,
    turnStartedAt: null,
    turnDeadline: null,
    turnDurationMs: 30000,
    wager: null,
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("recent rooms", () => {
  it("stores codes newest-first and dedupes", () => {
    rememberRoom("AAAA");
    rememberRoom("BBBB");
    rememberRoom("AAAA");
    expect(getRecentRooms()).toEqual(["AAAA", "BBBB"]);
  });

  it("caps at 5 entries", () => {
    for (const c of ["A", "B", "C", "D", "E", "F", "G"]) rememberRoom(c);
    expect(getRecentRooms()).toEqual(["G", "F", "E", "D", "C"]);
  });

  it("prunes entries older than the 3-day TTL on read", () => {
    const old = Date.now() - 4 * DAY;
    localStorage.setItem(
      ROOMS_KEY,
      JSON.stringify([
        { code: "OLD1", ts: old },
        { code: "NEW1", ts: Date.now() },
      ]),
    );
    expect(getRecentRooms()).toEqual(["NEW1"]);
    expect(JSON.parse(localStorage.getItem(ROOMS_KEY) ?? "[]")).toHaveLength(1);
  });

  it("forgetRoom removes a single code", () => {
    rememberRoom("AAAA");
    rememberRoom("BBBB");
    forgetRoom("AAAA");
    expect(getRecentRooms()).toEqual(["BBBB"]);
  });

  it("survives a corrupt/absent payload", () => {
    localStorage.setItem(ROOMS_KEY, "not json");
    expect(getRecentRooms()).toEqual([]);
  });
});

describe("recent challengers", () => {
  it("records opponent names with mode and timestamp, excluding self", () => {
    const g = game({
      mode: "clo",
      slots: [
        slot({ uid: "me", name: "Me" }),
        slot({ uid: "opp", name: "Riley" }),
      ],
    });
    rememberChallengers(g, "me");
    const list = getRecentChallengers();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Riley");
    expect(list[0]?.mode).toBe("clo");
    expect(typeof list[0]?.ts).toBe("number");
  });

  it("dedupes by name case-insensitively, keeping the most recent", () => {
    const earlier = game({
      mode: "craps",
      slots: [slot({ uid: "me", name: "Me" }), slot({ uid: "o1", name: "riley" })],
    });
    rememberChallengers(earlier, "me");
    const later = game({
      mode: "ten",
      slots: [slot({ uid: "me", name: "Me" }), slot({ uid: "o2", name: "RILEY" })],
    });
    rememberChallengers(later, "me");
    const list = getRecentChallengers();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("RILEY");
    expect(list[0]?.mode).toBe("ten");
  });

  it("prunes challengers older than the 3-day TTL", () => {
    const old = Date.now() - 4 * DAY;
    localStorage.setItem(
      CHALLENGERS_KEY,
      JSON.stringify([
        { name: "Stale", mode: "craps", ts: old },
        { name: "Fresh", mode: "craps", ts: Date.now() },
      ]),
    );
    const list = getRecentChallengers();
    expect(list.map((c) => c.name)).toEqual(["Fresh"]);
  });

  it("caps at 8 entries", () => {
    for (let i = 0; i < 12; i++) {
      rememberChallengers(
        game({ slots: [slot({ uid: "me", name: "Me" }), slot({ uid: `o${i}`, name: `P${i}` })] }),
        "me",
      );
    }
    expect(getRecentChallengers()).toHaveLength(8);
  });

  it("ignores a game with no opponents", () => {
    rememberChallengers(game({ slots: [slot({ uid: "me", name: "Me" })] }), "me");
    expect(getRecentChallengers()).toEqual([]);
  });
});

describe("timeAgo", () => {
  it("formats minutes, hours, and days compactly", () => {
    const now = new Date("2026-05-31T12:00:00Z").getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(timeAgo(now - 30 * 1000)).toBe("now");
    expect(timeAgo(now - 2 * 60 * 1000)).toBe("2m");
    expect(timeAgo(now - 60 * 60 * 1000)).toBe("1h");
    expect(timeAgo(now - 3 * DAY)).toBe("3d");
  });
});
