import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "./splash";
import { state, resetState, setState } from "../state";
import { createRoom } from "../firebase";
import { __resetMock } from "../firebase/mock";

function makeRoot(): HTMLElement {
  document.body.innerHTML = "";
  const el = document.createElement("section");
  el.id = "screen-splash";
  document.body.appendChild(el);
  return el;
}

function fire(el: Element, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

function press(el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  resetState();
  __resetMock();
  localStorage.clear();
});

describe("splash mount", () => {
  it("renders the logo, name field, and primary actions", () => {
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.querySelector(".splash-logo")?.textContent).toContain("Street");
    expect(root.querySelector<HTMLInputElement>('input[name="player-name"]')).not.toBeNull();
    expect(root.querySelector('[data-action="new-game"]')).not.toBeNull();
    expect(root.querySelector('[data-action="open-join"]')).not.toBeNull();
    cleanup();
  });

  it("hydrates the name input from state.myName", () => {
    setState({ myName: "Jay" });
    const root = makeRoot();
    mount(root);
    const input = root.querySelector<HTMLInputElement>('input[name="player-name"]')!;
    expect(input.value).toBe("Jay");
  });

  it("mirrors typed name into state.myName", () => {
    const root = makeRoot();
    mount(root);
    const input = root.querySelector<HTMLInputElement>('input[name="player-name"]')!;
    input.value = "Riley";
    fire(input, "input");
    expect(state.myName).toBe("Riley");
  });
});

describe("splash New Game", () => {
  it("blocks navigation when no name and shows status", () => {
    const root = makeRoot();
    mount(root);
    const btn = root.querySelector<HTMLButtonElement>('[data-action="new-game"]')!;
    btn.click();
    expect(state.screen).toBe("boot");
    expect(root.querySelector("#splash-status")?.textContent).toContain("name");
  });

  it("navigates to mode-select when name is set", () => {
    setState({ myName: "Jay" });
    const root = makeRoot();
    mount(root);
    const btn = root.querySelector<HTMLButtonElement>('[data-action="new-game"]')!;
    btn.click();
    expect(state.screen).toBe("mode-select");
  });

  it("does NOT call createRoom from splash (mode-select owns that)", () => {
    setState({ myName: "Jay" });
    const root = makeRoot();
    mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="new-game"]')!.click();
    expect(state.currentRoom).toBeNull();
    expect(state.game).toBeNull();
  });
});

describe("splash Join with Code (inline)", () => {
  it("reveals the join input on click", () => {
    setState({ myName: "Jay" });
    const root = makeRoot();
    mount(root);
    const joinRow = root.querySelector<HTMLDivElement>("#join-row")!;
    expect(joinRow.hidden).toBe(true);
    root.querySelector<HTMLButtonElement>('[data-action="open-join"]')!.click();
    expect(joinRow.hidden).toBe(false);
  });

  it("uppercases and strips non-alphanumerics in the code field", () => {
    setState({ myName: "Jay" });
    const root = makeRoot();
    mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="open-join"]')!.click();
    const code = root.querySelector<HTMLInputElement>("#join-code")!;
    code.value = "ab!2";
    fire(code, "input");
    expect(code.value).toBe("AB2");
  });

  it("rejects codes that are not exactly 4 chars", async () => {
    setState({ myName: "Jay" });
    const root = makeRoot();
    mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="open-join"]')!.click();
    const code = root.querySelector<HTMLInputElement>("#join-code")!;
    code.value = "AB";
    fire(code, "input");
    root.querySelector<HTMLButtonElement>('[data-action="submit-join"]')!.click();
    await flush();
    expect(root.querySelector("#splash-status")?.textContent).toContain("4");
    expect(state.screen).toBe("boot");
  });

  it("shows ROOM_NOT_FOUND status for an unknown code", async () => {
    setState({ myName: "Jay", myUid: "uid-jay" });
    const root = makeRoot();
    mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="open-join"]')!.click();
    const code = root.querySelector<HTMLInputElement>("#join-code")!;
    code.value = "ZZZZ";
    fire(code, "input");
    root.querySelector<HTMLButtonElement>('[data-action="submit-join"]')!.click();
    await flush();
    expect(root.querySelector("#splash-status")?.textContent).toBe("Room not found");
    expect(state.screen).toBe("boot");
  });

  it("joins an existing waiting room and lands in lobby", async () => {
    setState({ myName: "Jay", myUid: "uid-jay" });
    // 3 seats so the join leaves a slot open and the room stays "waiting"
    // (filling the last seat would auto-start the game → "play").
    const code = await createRoom({
      mode: "craps",
      numPlayers: 3,
      hostUid: "host-1",
      hostName: "Host",
    });

    const root = makeRoot();
    mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="open-join"]')!.click();
    const codeInput = root.querySelector<HTMLInputElement>("#join-code")!;
    codeInput.value = code;
    fire(codeInput, "input");
    root.querySelector<HTMLButtonElement>('[data-action="submit-join"]')!.click();
    await flush();
    await flush();

    expect(state.currentRoom).toBe(code);
    expect(state.screen).toBe("lobby");
    expect(state.myUid).not.toBeNull();
  });

  it("does NOT mint a uid; relies on state.myUid set by boot", async () => {
    setState({ myName: "Jay", myUid: "uid-from-boot" });
    const code = await createRoom({
      mode: "craps",
      numPlayers: 2,
      hostUid: "host-1",
      hostName: "Host",
    });
    const root = makeRoot();
    mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="open-join"]')!.click();
    const codeInput = root.querySelector<HTMLInputElement>("#join-code")!;
    codeInput.value = code;
    fire(codeInput, "input");
    root.querySelector<HTMLButtonElement>('[data-action="submit-join"]')!.click();
    await flush();
    await flush();
    expect(state.myUid).toBe("uid-from-boot");
  });

  it("shows a status and stays put when myUid is missing", async () => {
    setState({ myName: "Jay" });
    expect(state.myUid).toBeNull();
    const code = await createRoom({
      mode: "craps",
      numPlayers: 2,
      hostUid: "host-1",
      hostName: "Host",
    });
    const root = makeRoot();
    mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="open-join"]')!.click();
    const codeInput = root.querySelector<HTMLInputElement>("#join-code")!;
    codeInput.value = code;
    fire(codeInput, "input");
    root.querySelector<HTMLButtonElement>('[data-action="submit-join"]')!.click();
    await flush();
    await flush();
    expect(state.myUid).toBeNull();
    expect(state.currentRoom).toBeNull();
    expect(root.querySelector("#splash-status")?.textContent).toContain("signing in");
  });
});

describe("splash keyboard", () => {
  it("Enter on the name input advances to mode-select when name is set", () => {
    setState({ myName: "Jay" });
    const root = makeRoot();
    mount(root);
    const input = root.querySelector<HTMLInputElement>('input[name="player-name"]')!;
    press(input, "Enter");
    expect(state.screen).toBe("mode-select");
  });
});

describe("splash invite banner", () => {
  it("shows the banner and auto-fills the join input when state.currentRoom is set", () => {
    setState({ currentRoom: "XY9Z" });
    const root = makeRoot();
    const cleanup = mount(root);

    const banner = root.querySelector<HTMLDivElement>("#invite-banner")!;
    expect(banner.hidden).toBe(false);
    expect(root.querySelector("#invite-banner-code")?.textContent).toBe("XY9Z");

    const joinInput = root.querySelector<HTMLInputElement>("#join-code")!;
    expect(joinInput.value).toBe("XY9Z");

    const joinRow = root.querySelector<HTMLDivElement>("#join-row")!;
    expect(joinRow.hidden).toBe(false);

    cleanup();
  });

  it("keeps the banner hidden when there is no pending room", () => {
    const root = makeRoot();
    const cleanup = mount(root);

    const banner = root.querySelector<HTMLDivElement>("#invite-banner")!;
    expect(banner.hidden).toBe(true);
    expect(root.querySelector("#invite-banner-code")?.textContent).toBe("----");

    cleanup();
  });
});

describe("splash player name persistence", () => {
  it("saves the trimmed name to localStorage on New Game", () => {
    setState({ myName: "  Jay  " });
    const root = makeRoot();
    mount(root);

    root.querySelector<HTMLButtonElement>('[data-action="new-game"]')!.click();

    expect(localStorage.getItem("streetdice.myName")).toBe("Jay");
  });

  it("saves the trimmed name to localStorage on Enter in the name field", () => {
    setState({ myName: "Riley" });
    const root = makeRoot();
    mount(root);

    const input = root.querySelector<HTMLInputElement>('input[name="player-name"]')!;
    press(input, "Enter");

    expect(localStorage.getItem("streetdice.myName")).toBe("Riley");
  });

  it("does not persist the name when validation fails (empty name)", () => {
    const root = makeRoot();
    mount(root);

    root.querySelector<HTMLButtonElement>('[data-action="new-game"]')!.click();

    expect(localStorage.getItem("streetdice.myName")).toBeNull();
  });
});

describe("splash recent rooms", () => {
  it("renders recent room buttons from localStorage", () => {
    const now = Date.now();
    localStorage.setItem(
      "streetdice.recentRooms",
      JSON.stringify([
        { code: "AB12", ts: now },
        { code: "CD34", ts: now - 1000 },
      ]),
    );
    const root = makeRoot();
    const cleanup = mount(root);

    const buttons = root.querySelectorAll<HTMLButtonElement>('[data-action="join-room"]');
    expect(buttons.length).toBe(2);
    expect(buttons[0].dataset["code"]).toBe("AB12");
    expect(buttons[1].dataset["code"]).toBe("CD34");

    cleanup();
  });

  it("excludes the pending room from the recent list", () => {
    const now = Date.now();
    localStorage.setItem(
      "streetdice.recentRooms",
      JSON.stringify([
        { code: "AB12", ts: now },
        { code: "XY9Z", ts: now - 1000 },
        { code: "CD34", ts: now - 2000 },
      ]),
    );
    setState({ currentRoom: "XY9Z" });
    const root = makeRoot();
    const cleanup = mount(root);

    const buttons = root.querySelectorAll<HTMLButtonElement>('[data-action="join-room"]');
    expect(buttons.length).toBe(2);
    expect(buttons[0].dataset["code"]).toBe("AB12");
    expect(buttons[1].dataset["code"]).toBe("CD34");

    cleanup();
  });

  it("renders nothing when there are no recent rooms", () => {
    const root = makeRoot();
    const cleanup = mount(root);

    const section = root.querySelector<HTMLDivElement>("#recent-section")!;
    expect(section.innerHTML).toBe("");
    expect(section.querySelectorAll('[data-action="join-room"]').length).toBe(0);

    cleanup();
  });

  it("clicking a recent room button fills the join input with the code", () => {
    const now = Date.now();
    localStorage.setItem(
      "streetdice.recentRooms",
      JSON.stringify([{ code: "AB12", ts: now }]),
    );
    setState({ myName: "Jay", myUid: "uid-jay" });
    const root = makeRoot();
    mount(root);

    const btn = root.querySelector<HTMLButtonElement>('[data-action="join-room"]')!;
    btn.click();

    const joinInput = root.querySelector<HTMLInputElement>("#join-code")!;
    expect(joinInput.value).toBe("AB12");

    const joinRow = root.querySelector<HTMLDivElement>("#join-row")!;
    expect(joinRow.hidden).toBe(false);
  });
});

describe("splash cleanup", () => {
  it("clears the root and removes the .splash class on unmount", () => {
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.classList.contains("splash")).toBe(true);
    cleanup();
    expect(root.innerHTML).toBe("");
    expect(root.classList.contains("splash")).toBe(false);
  });
});
