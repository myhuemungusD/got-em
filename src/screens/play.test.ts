import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "./play";
import { resetState, setState, state } from "../state";
import type { GameMode, GameState, Slot } from "../state";
import {
  createRoom,
  joinRoom,
  startGame,
  readGame,
} from "../firebase";
import type { GameDoc } from "../firebase";
import { __resetMock, doc as mockDoc, setDoc } from "../firebase/mock";
import { setDieSource, resetDieSource } from "../scoring/dice";

function makeRoot(): HTMLElement {
  document.body.innerHTML = "";
  const el = document.createElement("section");
  el.id = "screen-play";
  document.body.appendChild(el);
  return el;
}

function makeSlot(uid: string | null, name: string, over: Partial<Slot> = {}): Slot {
  return { uid, name, score: 0, onBoard: false, chips: 100, ...over };
}

function makeGame(over: Partial<GameState> = {}): GameState {
  return {
    v: 1,
    code: "WXYZ",
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
    turnStartedAt: 1000,
    turnDeadline: 31000,
    turnDurationMs: 30000,
    wager: null,
    craps: { phase: "comeout", point: null },
    ...over,
  };
}

/**
 * Seed both the central state and the mock store, so the room subscription the
 * play screen installs mirrors the same doc instead of seeing an empty store
 * and tearing the room down.
 */
function seed(game: GameState, myUid: string): void {
  void setDoc(mockDoc(undefined, "games", game.code), {
    ...game,
    createdAt: 0,
    updatedAt: 0,
  });
  setState({ game, myUid, currentRoom: game.code, screen: "play" });
}

function fire(el: Element, type = "click"): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  resetState();
  __resetMock();
});

afterEach(() => {
  resetDieSource();
});

describe("play scoreboard", () => {
  it("renders a chip per player with names and scores", () => {
    seed(
      makeGame({
        slots: [
          makeSlot("u1", "Ace", { score: 2 }),
          makeSlot("u2", "Blaze", { score: 1 }),
        ],
      }),
      "u1",
    );
    const root = makeRoot();
    const cleanup = mount(root);

    const chips = root.querySelectorAll(".player-chip");
    expect(chips.length).toBe(2);
    expect(root.textContent).toContain("Ace");
    expect(root.textContent).toContain("Blaze");
    const scores = [...root.querySelectorAll(".player-score")].map(
      (n) => n.textContent,
    );
    expect(scores).toEqual(["2", "1"]);
    cleanup();
  });

  it("marks the current player and the local seat", () => {
    seed(makeGame({ current: 1 }), "u1");
    const root = makeRoot();
    const cleanup = mount(root);

    const chips = root.querySelectorAll<HTMLElement>(".player-chip");
    expect(chips[0]?.classList.contains("me")).toBe(true);
    expect(chips[1]?.classList.contains("current")).toBe(true);
    expect(chips[0]?.classList.contains("current")).toBe(false);
    cleanup();
  });

  it("renders the room code and mode label", () => {
    seed(makeGame({ code: "ABCD", mode: "ten" }), "u1");
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.querySelector("#play-room")?.textContent).toBe("ABCD");
    expect(root.querySelector("#play-mode")?.textContent).toBe("10K");
    cleanup();
  });
});

describe("turn banner", () => {
  it("shows Your Turn when it is my seat", () => {
    seed(makeGame({ current: 0 }), "u1");
    const root = makeRoot();
    const cleanup = mount(root);
    const banner = root.querySelector("#turn-banner")!;
    expect(banner.querySelector(".turn-tag")?.textContent).toBe("Your Turn");
    expect(banner.textContent).toContain("Ace");
    cleanup();
  });

  it("shows the waiting tag when it is another seat", () => {
    seed(makeGame({ current: 1 }), "u1");
    const root = makeRoot();
    const cleanup = mount(root);
    const tag = root.querySelector("#turn-banner .turn-tag");
    expect(tag?.classList.contains("wait")).toBe(true);
    expect(tag?.textContent).toBe("Wait");
    cleanup();
  });

  it("shows Game Over when finished", () => {
    seed(makeGame({ status: "finished", winner: "u1" }), "u1");
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.querySelector("#turn-banner")?.textContent).toContain(
      "Game Over",
    );
    cleanup();
  });
});

describe("action bar", () => {
  it("shows a single Roll button for craps on my turn", () => {
    seed(makeGame({ mode: "craps", current: 0 }), "u1");
    const root = makeRoot();
    const cleanup = mount(root);
    const buttons = root.querySelectorAll('#action-bar [data-action="roll"]');
    expect(buttons.length).toBe(1);
    expect(buttons[0]?.textContent).toBe("Roll");
    cleanup();
  });

  it("shows a single Roll button for clo on my turn", () => {
    seed(makeGame({ mode: "clo", current: 0 }), "u1");
    const root = makeRoot();
    const cleanup = mount(root);
    expect(
      root.querySelectorAll('#action-bar [data-action="roll"]').length,
    ).toBe(1);
    cleanup();
  });

  it("shows a waiting banner instead of buttons when not my turn", () => {
    seed(makeGame({ mode: "craps", current: 1 }), "u1");
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.querySelector("#action-bar .waiting-banner")).not.toBeNull();
    expect(root.querySelector('#action-bar [data-action="roll"]')).toBeNull();
    cleanup();
  });

  it("shows Roll (not Bank/Again) for ten before a choice", () => {
    seed(
      makeGame({
        mode: "ten",
        ten: { turnScore: 0, kept: [], rolledThisStep: [], mustChoose: false },
      }),
      "u1",
    );
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.querySelector('[data-action="roll"]')).not.toBeNull();
    expect(root.querySelector('[data-action="ten-bank"]')).toBeNull();
    cleanup();
  });

  it("shows Bank + Roll Again for ten when a choice is pending", () => {
    seed(
      makeGame({
        mode: "ten",
        lastRoll: [1, 3, 4, 2, 2, 3],
        lastResult: { outcome: "rolled", label: "" },
        lastRollId: "r1",
        lastRolledBy: "u1",
        ten: {
          turnScore: 0,
          kept: [],
          rolledThisStep: [1, 3, 4, 2, 2, 3],
          mustChoose: true,
        },
      }),
      "u1",
    );
    setState({ lastSeenRollId: "r1" });
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.querySelector('[data-action="ten-bank"]')).not.toBeNull();
    expect(root.querySelector('[data-action="ten-roll-again"]')).not.toBeNull();
    expect(root.querySelector('[data-action="roll"]')).toBeNull();
    cleanup();
  });
});

describe("ten keep-toggle", () => {
  function seedTenChoice(): void {
    seed(
      makeGame({
        mode: "ten",
        lastRoll: [1, 3, 4, 2, 2, 3],
        lastResult: { outcome: "rolled", label: "" },
        lastRollId: "r1",
        lastRolledBy: "u1",
        ten: {
          turnScore: 0,
          kept: [],
          rolledThisStep: [1, 3, 4, 2, 2, 3],
          mustChoose: true,
        },
      }),
      "u1",
    );
    setState({ lastSeenRollId: "r1" });
  }

  it("toggles a scoring die index into pendingTenSelection", () => {
    seedTenChoice();
    const root = makeRoot();
    const cleanup = mount(root);

    const dice = root.querySelectorAll<HTMLElement>("#dice .die");
    expect(dice.length).toBe(6);
    // Index 0 is a 1 (the only scoring die). Click toggles it on.
    fire(dice[0]!);
    expect(state.pendingTenSelection).toEqual([0]);
    cleanup();
  });

  it("ignores a non-scoring die", () => {
    seedTenChoice();
    const root = makeRoot();
    const cleanup = mount(root);
    const dice = root.querySelectorAll<HTMLElement>("#dice .die");
    // Index 2 is a 4 (non-scoring in [1,3,4,2,2,3]).
    fire(dice[2]!);
    expect(state.pendingTenSelection).toEqual([]);
    cleanup();
  });

  it("enables Bank/Roll Again once a die is selected", () => {
    seedTenChoice();
    const root = makeRoot();
    const cleanup = mount(root);
    const bank = root.querySelector<HTMLButtonElement>('[data-action="ten-bank"]')!;
    expect(bank.disabled).toBe(true);
    fire(root.querySelectorAll<HTMLElement>("#dice .die")[0]!);
    const bankAfter = root.querySelector<HTMLButtonElement>('[data-action="ten-bank"]')!;
    expect(bankAfter.disabled).toBe(false);
    cleanup();
  });
});

describe("animation lock", () => {
  it("disables action buttons while a roll animates", () => {
    seed(makeGame({ mode: "craps", current: 0 }), "u1");
    setState({ isAnimatingRoll: true });
    const root = makeRoot();
    const cleanup = mount(root);
    const btn = root.querySelector<HTMLButtonElement>('[data-action="roll"]')!;
    expect(btn.disabled).toBe(true);
    cleanup();
  });
});

describe("roll wiring through the ops", () => {
  async function liveGame(mode: GameMode): Promise<string> {
    const code = await createRoom({
      mode,
      numPlayers: 2,
      hostUid: "u1",
      hostName: "Ace",
    });
    await joinRoom({ code, slotIdx: 1, uid: "u2", name: "Blaze" });
    await startGame({ code, hostUid: "u1" });
    return code;
  }

  it("craps Roll calls rollCraps and advances the game state", async () => {
    const code = await liveGame("craps");
    const before = (await readGame(code)) as GameDoc;
    seed(before, "u1");

    // 3 + 4 = 7 on the come-out: a craps win → score increments.
    const queue = [3, 4];
    let qi = 0;
    setDieSource(() => queue[qi++ % queue.length]!);
    const root = makeRoot();
    const cleanup = mount(root);

    fire(root.querySelector('[data-action="roll"]')!);
    await flush();

    const after = (await readGame(code)) as GameDoc;
    expect(after.lastRollId).not.toBe(before.lastRollId);
    expect(after.lastRoll).toEqual([3, 4]);
    expect(after.slots[0]?.score).toBe(1);
    cleanup();
  });

  it("clo Roll calls rollClo", async () => {
    const code = await liveGame("clo");
    const before = (await readGame(code)) as GameDoc;
    seed(before, "u1");

    setDieSource(() => 4); // 4-4-4 triple, a determinate result
    const root = makeRoot();
    const cleanup = mount(root);

    fire(root.querySelector('[data-action="roll"]')!);
    await flush();

    const after = (await readGame(code)) as GameDoc;
    expect(after.lastRoll).toEqual([4, 4, 4]);
    expect(after.matchup?.rolls?.["u1"]).toEqual([4, 4, 4]);
    cleanup();
  });

  it("does not roll when it is not my turn", async () => {
    const code = await liveGame("craps");
    const before = (await readGame(code)) as GameDoc;
    seed(before, "u2"); // u2 is not current (u1 is)

    setDieSource(() => 3);
    const root = makeRoot();
    const cleanup = mount(root);

    // Not my turn → waiting banner, no roll button.
    expect(root.querySelector('[data-action="roll"]')).toBeNull();

    const after = (await readGame(code)) as GameDoc;
    expect(after.lastRollId).toBe(before.lastRollId);
    cleanup();
  });
});

describe("cleanup", () => {
  it("empties the root and removes the play class", () => {
    seed(makeGame(), "u1");
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.querySelector(".scoreboard")).not.toBeNull();
    cleanup();
    expect(root.innerHTML).toBe("");
    expect(root.classList.contains("play")).toBe(false);
  });
});
