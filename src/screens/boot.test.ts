import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "./boot";
import { state, resetState } from "../state";
import { __resetAuthForTests } from "../auth";

const UID_KEY = "gotem_uid";

function makeRoot(): HTMLElement {
  document.body.innerHTML = "";
  const el = document.createElement("section");
  el.id = "screen-boot";
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
  localStorage.clear();
  __resetAuthForTests();
  window.location.hash = "";
  history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
  __resetAuthForTests();
});

describe("boot mount", () => {
  it("renders a loading indicator immediately", () => {
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.querySelector(".boot-spinner")).not.toBeNull();
    cleanup();
  });

  it("sets state.myUid and transitions to splash with no invite", async () => {
    expect(state.myUid).toBeNull();
    const root = makeRoot();
    const cleanup = mount(root);
    await flush();
    expect(state.myUid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(state.myUid).toBe(localStorage.getItem(UID_KEY));
    expect(state.currentRoom).toBeNull();
    expect(state.screen).toBe("splash");
    cleanup();
  });

  it("restores a saved display name into state.myName", async () => {
    localStorage.setItem("streetdice.myName", "Riley");
    const root = makeRoot();
    const cleanup = mount(root);
    await flush();
    expect(state.myName).toBe("Riley");
    cleanup();
  });

  it("stashes a deep-link room code in currentRoom before routing to splash", async () => {
    history.replaceState(null, "", "/?room=abcd");
    const root = makeRoot();
    const cleanup = mount(root);
    await flush();
    expect(state.currentRoom).toBe("ABCD");
    expect(state.screen).toBe("splash");
    cleanup();
  });

  it("does not transition after cleanup runs", async () => {
    const root = makeRoot();
    const cleanup = mount(root);
    cleanup();
    await flush();
    expect(state.screen).toBe("boot");
    expect(root.innerHTML).toBe("");
  });
});
