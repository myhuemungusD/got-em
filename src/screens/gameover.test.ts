import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "./gameover";
import { state, resetState, setState, type GameState, type Slot } from "../state";
import { __resetMock } from "../firebase/mock";

function makeRoot(): HTMLElement {
  document.body.innerHTML = "";
  const el = document.createElement("section");
  el.id = "screen-gameover";
  document.body.appendChild(el);
  return el;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function slot(over: Partial<Slot>): Slot {
  return { uid: null, name: "", score: 0, onBoard: false, chips: 100, ...over };
}

function finishedGame(over: Partial<GameState> = {}): GameState {
  return {
    v: 1,
    code: "WXYZ",
    mode: "craps",
    hostUid: "me",
    numSlots: 2,
    slots: [
      slot({ uid: "me", name: "Jay", score: 3 }),
      slot({ uid: "opp", name: "Riley", score: 1 }),
    ],
    playerUids: ["me", "opp"],
    current: 0,
    status: "finished",
    winner: "me",
    lastRoll: [4, 3],
    lastResult: { outcome: "natural", label: "7 — winner" },
    lastRollId: "r1",
    lastRolledBy: "me",
    turnStartedAt: null,
    turnDeadline: null,
    turnDurationMs: 30000,
    wager: null,
    ...over,
  };
}

beforeEach(() => {
  resetState();
  __resetMock();
  localStorage.clear();
});

describe("gameover render", () => {
  it("shows the winner name banner", () => {
    setState({ myUid: "me", myName: "Jay", game: finishedGame() });
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.querySelector("#winner-name")?.textContent).toBe("Jay");
    cleanup();
  });

  it("renders players ranked by score with the winner highlighted", () => {
    setState({ myUid: "me", myName: "Jay", game: finishedGame() });
    const root = makeRoot();
    const cleanup = mount(root);
    const rows = root.querySelectorAll<HTMLDivElement>(".final-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector(".final-row-name")?.textContent).toContain("Jay");
    expect(rows[0]?.classList.contains("winner")).toBe(true);
    expect(rows[0]?.querySelector(".final-row-rank")?.textContent).toBe("1st");
    expect(rows[1]?.querySelector(".final-row-name")?.textContent).toContain("Riley");
    expect(rows[1]?.classList.contains("winner")).toBe(false);
    cleanup();
  });

  it("marks the local player with (you)", () => {
    setState({ myUid: "me", myName: "Jay", game: finishedGame() });
    const root = makeRoot();
    const cleanup = mount(root);
    const me = root.querySelector(".final-row.winner .final-row-name");
    expect(me?.textContent).toContain("(you)");
    cleanup();
  });

  it("formats 10000-mode scores with thousands separators", () => {
    setState({
      myUid: "me",
      myName: "Jay",
      game: finishedGame({
        mode: "ten",
        winner: "me",
        slots: [
          slot({ uid: "me", name: "Jay", score: 10000 }),
          slot({ uid: "opp", name: "Riley", score: 7250 }),
        ],
      }),
    });
    const root = makeRoot();
    const cleanup = mount(root);
    const scores = [...root.querySelectorAll(".final-row-score")].map((n) => n.textContent);
    expect(scores).toEqual(["10,000", "7,250"]);
    cleanup();
  });

  it("does not separator-format non-ten scores", () => {
    setState({
      myUid: "me",
      myName: "Jay",
      game: finishedGame({
        mode: "ten",
        winner: "me",
        slots: [slot({ uid: "me", name: "Jay", score: 1234 })],
      }),
    });
    const ten = makeRoot();
    let c = mount(ten);
    expect(ten.querySelector(".final-row-score")?.textContent).toBe("1,234");
    c();

    setState({ game: finishedGame({ slots: [slot({ uid: "me", name: "Jay", score: 1234 })] }) });
    const craps = makeRoot();
    c = mount(craps);
    expect(craps.querySelector(".final-row-score")?.textContent).toBe("1234");
    c();
  });
});

describe("gameover recent lists", () => {
  it("records the room and challengers on mount", () => {
    setState({ myUid: "me", myName: "Jay", game: finishedGame() });
    const root = makeRoot();
    const cleanup = mount(root);
    const rooms = JSON.parse(localStorage.getItem("streetdice.recentRooms") ?? "[]") as {
      code: string;
    }[];
    expect(rooms.map((r) => r.code)).toContain("WXYZ");
    const challengers = JSON.parse(
      localStorage.getItem("streetdice.recentChallengers") ?? "[]",
    ) as { name: string }[];
    expect(challengers.map((c) => c.name)).toContain("Riley");
    cleanup();
  });
});

describe("gameover actions", () => {
  it("Play Again creates a fresh room and lands in lobby", async () => {
    setState({ myUid: "me", myName: "Jay", game: finishedGame() });
    const root = makeRoot();
    const cleanup = mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="play-again"]')!.click();
    await flush();
    await flush();
    expect(state.screen).toBe("lobby");
    expect(state.currentRoom).not.toBeNull();
    expect(state.currentRoom).not.toBe("WXYZ");
    cleanup();
  });

  it("New Game navigates to mode-select without creating a room", () => {
    setState({ myUid: "me", myName: "Jay", game: finishedGame() });
    const root = makeRoot();
    const cleanup = mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="new-game"]')!.click();
    expect(state.screen).toBe("mode-select");
    expect(state.currentRoom).toBeNull();
    cleanup();
  });

  it("Home returns to splash and clears the room", async () => {
    setState({ myUid: "me", myName: "Jay", currentRoom: "WXYZ", game: finishedGame() });
    const root = makeRoot();
    const cleanup = mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="home"]')!.click();
    await flush();
    await flush();
    expect(state.screen).toBe("splash");
    expect(state.currentRoom).toBeNull();
    expect(state.game).toBeNull();
    cleanup();
  });
});

describe("gameover cleanup", () => {
  it("empties root and drops the gameover class", () => {
    setState({ myUid: "me", myName: "Jay", game: finishedGame() });
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.classList.contains("gameover")).toBe(true);
    cleanup();
    expect(root.innerHTML).toBe("");
    expect(root.classList.contains("gameover")).toBe(false);
  });
});
