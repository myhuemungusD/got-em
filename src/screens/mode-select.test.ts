import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "./mode-select";
import { state, resetState, setState } from "../state";
import { __resetMock } from "../firebase/mock";

function makeRoot(): HTMLElement {
  document.body.innerHTML = "";
  const el = document.createElement("section");
  el.id = "screen-mode-select";
  document.body.appendChild(el);
  return el;
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

describe("mode-select mount", () => {
  it("renders four mode cards with names and taglines", () => {
    const root = makeRoot();
    const cleanup = mount(root);
    const cards = root.querySelectorAll(".mode-card");
    expect(cards).toHaveLength(4);
    expect(root.querySelector('[data-mode="craps"] .mode-name')?.textContent).toBe("Craps");
    expect(root.querySelector('[data-mode="ten"] .mode-target')?.textContent).toBe("Race to 10,000");
    cleanup();
  });

  it("highlights the currently selected mode from state", () => {
    setState({ selectedMode: "clo" });
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.querySelector('[data-mode="clo"]')?.classList.contains("selected")).toBe(true);
    expect(root.querySelector('[data-mode="craps"]')?.classList.contains("selected")).toBe(false);
    cleanup();
  });

  it("shows the current player count", () => {
    setState({ selectedPlayerCount: 4 });
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.querySelector("#player-count-val")?.textContent).toBe("4");
    cleanup();
  });
});

describe("mode-select interaction", () => {
  it("selecting a card updates selectedMode and re-highlights", () => {
    const root = makeRoot();
    const cleanup = mount(root);
    root.querySelector<HTMLButtonElement>('[data-mode="s456"]')!.click();
    expect(state.selectedMode).toBe("s456");
    expect(root.querySelector('[data-mode="s456"]')?.classList.contains("selected")).toBe(true);
    expect(root.querySelector('[data-mode="craps"]')?.classList.contains("selected")).toBe(false);
    cleanup();
  });

  it("stepper increments and decrements, clamping at 2 and 6", () => {
    const root = makeRoot();
    const cleanup = mount(root);
    const down = root.querySelector<HTMLButtonElement>('[data-action="players-down"]')!;
    const up = root.querySelector<HTMLButtonElement>('[data-action="players-up"]')!;

    expect(state.selectedPlayerCount).toBe(2);
    expect(down.disabled).toBe(true);

    up.click();
    expect(state.selectedPlayerCount).toBe(3);
    expect(root.querySelector("#player-count-val")?.textContent).toBe("3");

    for (let i = 0; i < 10; i++) up.click();
    expect(state.selectedPlayerCount).toBe(6);
    expect(up.disabled).toBe(true);

    for (let i = 0; i < 10; i++) down.click();
    expect(state.selectedPlayerCount).toBe(2);
    expect(down.disabled).toBe(true);

    cleanup();
  });

  it("Back navigates to splash", () => {
    const root = makeRoot();
    const cleanup = mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="back"]')!.click();
    expect(state.screen).toBe("splash");
    cleanup();
  });
});

describe("mode-select Create Game", () => {
  it("disables the create button when there is no uid", () => {
    const root = makeRoot();
    const cleanup = mount(root);
    expect(state.myUid).toBeNull();
    const btn = root.querySelector<HTMLButtonElement>("#btn-create-game")!;
    expect(btn.disabled).toBe(true);
    btn.click();
    expect(state.currentRoom).toBeNull();
    cleanup();
  });

  it("creates a room and transitions to lobby via watchRoom", async () => {
    setState({ myUid: "host-1", myName: "Jay", selectedMode: "clo", selectedPlayerCount: 3 });
    const root = makeRoot();
    const cleanup = mount(root);
    const btn = root.querySelector<HTMLButtonElement>("#btn-create-game")!;
    expect(btn.disabled).toBe(false);
    btn.click();
    await flush();
    await flush();

    expect(state.currentRoom).not.toBeNull();
    expect(state.screen).toBe("lobby");
    expect(state.game?.mode).toBe("clo");
    expect(state.game?.slots).toHaveLength(3);
    cleanup();
  });
});

describe("mode-select cleanup", () => {
  it("clears root, removes class, and stops responding to state changes", () => {
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.classList.contains("mode-select")).toBe(true);
    cleanup();
    expect(root.innerHTML).toBe("");
    expect(root.classList.contains("mode-select")).toBe(false);
    setState({ selectedMode: "ten" });
    expect(root.innerHTML).toBe("");
  });
});
