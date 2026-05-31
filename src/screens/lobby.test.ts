import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "./lobby";
import { state, resetState, setState } from "../state";
import type { GameState, Slot } from "../state";
import { createRoom, joinRoom, readGame } from "../firebase";
import { __resetMock, setDoc, doc as mockDoc } from "../firebase/mock";

function makeRoot(): HTMLElement {
  document.body.innerHTML = "";
  const el = document.createElement("section");
  el.id = "screen-lobby";
  document.body.appendChild(el);
  return el;
}

function makeSlot(uid: string | null, name: string): Slot {
  return { uid, name, score: 0, onBoard: false, chips: 100 };
}

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    v: 1,
    code: "ABCD",
    mode: "craps",
    hostUid: "host-1",
    numSlots: 3,
    slots: [makeSlot("host-1", "Ace"), makeSlot(null, ""), makeSlot(null, "")],
    playerUids: ["host-1"],
    current: 0,
    status: "waiting",
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
    ...overrides,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

beforeEach(() => {
  resetState();
  __resetMock();
});

describe("lobby render", () => {
  it("renders the room code, mode badge, and slot list from state.game", () => {
    setState({ game: makeGame(), myUid: "outsider" });
    const root = makeRoot();
    const cleanup = mount(root);

    expect(root.querySelector("#lobby-code")?.textContent).toBe("ABCD");
    expect(root.querySelector("#lobby-mode")?.textContent).toBe("CRAPS");

    const rows = root.querySelectorAll(".slot-row");
    expect(rows.length).toBe(3);
    expect(rows[0]?.querySelector(".slot-name")?.textContent).toBe("Ace");
    expect(rows[1]?.querySelector(".slot-name")?.textContent).toBe("Open");
    cleanup();
  });

  it("marks the host slot and your slot", () => {
    setState({ game: makeGame(), myUid: "host-1" });
    const root = makeRoot();
    const cleanup = mount(root);
    const hostRow = root.querySelectorAll(".slot-row")[0]!;
    expect(hostRow.classList.contains("mine")).toBe(true);
    expect(hostRow.querySelector(".slot-meta")?.textContent).toContain("you");
    expect(hostRow.querySelector(".slot-meta")?.textContent?.toLowerCase()).toContain("host");
    cleanup();
  });
});

describe("lobby claim a seat", () => {
  it("shows Take-seat on open slots for a non-seated viewer", () => {
    setState({ game: makeGame(), myUid: "outsider" });
    const root = makeRoot();
    const cleanup = mount(root);
    const claimBtns = root.querySelectorAll('[data-action="claim"]');
    expect(claimBtns.length).toBe(2);
    cleanup();
  });

  it("does NOT show Take-seat to a viewer who already holds a slot", () => {
    setState({ game: makeGame(), myUid: "host-1" });
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.querySelectorAll('[data-action="claim"]').length).toBe(0);
    cleanup();
  });

  it("clicking Take-seat calls joinRoom for that slot", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "host-1",
      hostName: "Ace",
    });
    const g = await readGame(code);
    if (!g) throw new Error("seed failed");
    setState({ game: g, myUid: "joiner", myName: "Blaze" });

    const root = makeRoot();
    const cleanup = mount(root);
    const claimBtn = root.querySelector<HTMLButtonElement>('[data-action="claim"]')!;
    claimBtn.click();
    await flush();

    const after = await readGame(code);
    expect(after?.slots[1]?.uid).toBe("joiner");
    expect(after?.slots[1]?.name).toBe("Blaze");
    cleanup();
  });

  it("surfaces SLOT_TAKEN to the status line without throwing", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "host-1",
      hostName: "Ace",
    });
    await joinRoom({ code, slotIdx: 1, uid: "other", name: "Other" });
    const g = makeGame({ code, slots: [makeSlot("host-1", "Ace"), makeSlot(null, ""), makeSlot(null, "")], playerUids: ["host-1"] });
    setState({ game: g, myUid: "joiner", myName: "Blaze" });

    const root = makeRoot();
    const cleanup = mount(root);
    const claimBtn = root.querySelector<HTMLButtonElement>('[data-action="claim"]')!;
    claimBtn.click();
    await flush();

    expect(root.querySelector("#lobby-status")?.textContent).toContain("taken");
    cleanup();
  });
});

describe("lobby Start (host)", () => {
  it("host sees Start disabled with fewer than 2 filled", () => {
    setState({ game: makeGame(), myUid: "host-1" });
    const root = makeRoot();
    const cleanup = mount(root);
    const start = root.querySelector<HTMLButtonElement>("#lobby-start")!;
    expect(start.hidden).toBe(false);
    expect(start.disabled).toBe(true);
    cleanup();
  });

  it("host sees Start enabled at >=2 filled", () => {
    const g = makeGame({
      slots: [makeSlot("host-1", "Ace"), makeSlot("u2", "Blaze"), makeSlot(null, "")],
      playerUids: ["host-1", "u2"],
    });
    setState({ game: g, myUid: "host-1" });
    const root = makeRoot();
    const cleanup = mount(root);
    const start = root.querySelector<HTMLButtonElement>("#lobby-start")!;
    expect(start.hidden).toBe(false);
    expect(start.disabled).toBe(false);
    cleanup();
  });

  it("non-host never sees the Start button", () => {
    const g = makeGame({
      slots: [makeSlot("host-1", "Ace"), makeSlot("u2", "Blaze"), makeSlot(null, "")],
      playerUids: ["host-1", "u2"],
    });
    setState({ game: g, myUid: "u2" });
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.querySelector<HTMLButtonElement>("#lobby-start")?.hidden).toBe(true);
    expect(root.querySelector("#lobby-waiting")?.textContent).toContain("host");
    cleanup();
  });

  it("clicking Start calls startGame and flips the room to in_progress", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "host-1",
      hostName: "Ace",
    });
    await joinRoom({ code, slotIdx: 1, uid: "u2", name: "Blaze" });
    const g = await readGame(code);
    if (!g) throw new Error("seed failed");
    setState({ game: g, myUid: "host-1" });

    const root = makeRoot();
    const cleanup = mount(root);
    root.querySelector<HTMLButtonElement>("#lobby-start")!.click();
    await flush();

    const after = await readGame(code);
    expect(after?.status).toBe("in_progress");
    cleanup();
  });
});

describe("lobby Leave", () => {
  it("clicking Leave calls leaveGame and returns to splash via leaveRoom", async () => {
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "host-1",
      hostName: "Ace",
    });
    await joinRoom({ code, slotIdx: 1, uid: "joiner", name: "Blaze" });
    const g = await readGame(code);
    if (!g) throw new Error("seed failed");
    setState({ game: g, myUid: "joiner", currentRoom: code });

    const root = makeRoot();
    const cleanup = mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="leave"]')!.click();
    await flush();

    const after = await readGame(code);
    expect(after?.slots[1]?.uid).toBeNull();
    expect(state.screen).toBe("splash");
    expect(state.game).toBeNull();
    cleanup();
  });

  it("surfaces WAGER_LOCKED on leave without throwing or navigating", async () => {
    const g = makeGame({
      slots: [makeSlot("host-1", "Ace"), makeSlot("host-1-friend", "Bo"), makeSlot(null, "")],
      playerUids: ["host-1", "host-1-friend"],
      wager: {
        amount: 10,
        contributions: { "host-1": 10, "host-1-friend": 10 },
        total: 20,
        settled: false,
        paidTo: null,
      },
    });
    void setDoc(mockDoc(undefined, "games", g.code), g as unknown as Record<string, unknown>);
    setState({ game: g, myUid: "host-1", screen: "lobby", currentRoom: g.code });

    const root = makeRoot();
    const cleanup = mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="leave"]')!.click();
    await flush();

    expect(state.screen).toBe("lobby");
    expect(state.game).not.toBeNull();
    expect(root.querySelector("#lobby-status")?.textContent?.toLowerCase()).toContain("pot");
    cleanup();
  });
});

describe("lobby invite modal", () => {
  it("opens a backdrop modal and tears it down on unmount", () => {
    setState({ game: makeGame(), myUid: "host-1" });
    const root = makeRoot();
    const cleanup = mount(root);

    root.querySelector<HTMLButtonElement>('[data-action="invite"]')!.click();
    expect(document.querySelector(".modal-backdrop")).not.toBeNull();
    expect(document.querySelector(".invite-modal")).not.toBeNull();

    cleanup();
    expect(document.querySelector(".modal-backdrop")).toBeNull();
  });

  it("closes the modal when the Done button is clicked", () => {
    setState({ game: makeGame(), myUid: "host-1" });
    const root = makeRoot();
    const cleanup = mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="invite"]')!.click();
    const done = document.querySelector<HTMLButtonElement>('[data-action="close-modal"]')!;
    done.click();
    expect(document.querySelector(".modal-backdrop")).toBeNull();
    cleanup();
  });
});

describe("lobby copy code", () => {
  it("copies the room code to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    setState({ game: makeGame(), myUid: "host-1" });
    const root = makeRoot();
    const cleanup = mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="copy-code"]')!.click();
    await flush();
    expect(writeText).toHaveBeenCalledWith("ABCD");
    cleanup();
    vi.unstubAllGlobals();
  });
});

describe("lobby live update", () => {
  it("re-renders the slot list when state.game changes", () => {
    setState({ game: makeGame(), myUid: "outsider" });
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.querySelector(".slot-row")?.querySelector(".slot-name")?.textContent).toBe("Ace");

    const g2 = makeGame({
      slots: [makeSlot("host-1", "Ace"), makeSlot("late", "Late"), makeSlot(null, "")],
      playerUids: ["host-1", "late"],
    });
    setState({ game: g2 });
    const rows = root.querySelectorAll(".slot-row");
    expect(rows[1]?.querySelector(".slot-name")?.textContent).toBe("Late");
    cleanup();
  });
});

describe("lobby cleanup", () => {
  it("clears root and removes the .lobby class on unmount", () => {
    setState({ game: makeGame(), myUid: "host-1" });
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.classList.contains("lobby")).toBe(true);
    cleanup();
    expect(root.innerHTML).toBe("");
    expect(root.classList.contains("lobby")).toBe(false);
  });
});
