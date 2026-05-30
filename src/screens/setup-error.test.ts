import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "./setup-error";
import { resetState, setState } from "../state";

function makeRoot(): HTMLElement {
  document.body.innerHTML = "";
  const el = document.createElement("section");
  el.id = "screen-setup-error";
  document.body.appendChild(el);
  return el;
}

let reload: ReturnType<typeof vi.fn>;
let originalLocation: Location;

beforeEach(() => {
  resetState();
  reload = vi.fn();
  originalLocation = window.location;
  Object.defineProperty(window, "location", {
    value: { ...window.location, reload },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    value: originalLocation,
    writable: true,
    configurable: true,
  });
});

describe("setup-error mount", () => {
  it("renders fallback 'Unknown error' when state.lastError is null", () => {
    const root = makeRoot();
    const cleanup = mount(root);
    const msg = root.querySelector<HTMLParagraphElement>("p.setup-error__msg");
    expect(msg).not.toBeNull();
    expect(msg?.textContent).toBe("Unknown error");
    cleanup();
  });

  it("renders state.lastError when it was set before mount", () => {
    setState({ lastError: "Network down" });
    const root = makeRoot();
    const cleanup = mount(root);
    const msg = root.querySelector<HTMLParagraphElement>("p.setup-error__msg");
    expect(msg?.textContent).toBe("Network down");
    cleanup();
  });

  it("renders the heading and the Reload button", () => {
    const root = makeRoot();
    const cleanup = mount(root);
    const h1 = root.querySelector("h1");
    expect(h1?.textContent).toBe("Something went wrong");
    const btn = root.querySelector<HTMLButtonElement>("#setup-error-reload");
    expect(btn).not.toBeNull();
    expect(btn?.tagName).toBe("BUTTON");
    expect(btn?.textContent).toBe("Reload");
    cleanup();
  });
});

describe("setup-error reactivity", () => {
  it("updates the message paragraph in place when lastError changes after mount", () => {
    const root = makeRoot();
    const cleanup = mount(root);
    const msgBefore = root.querySelector<HTMLParagraphElement>("p.setup-error__msg")!;
    expect(msgBefore.textContent).toBe("Unknown error");

    setState({ lastError: "later" });

    const paragraphs = root.querySelectorAll("p.setup-error__msg");
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0]?.textContent).toBe("later");
    cleanup();
  });

  it("updates from one non-null lastError to another in place", () => {
    setState({ lastError: "first" });
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.querySelector("p.setup-error__msg")?.textContent).toBe("first");

    setState({ lastError: "second" });
    const paragraphs = root.querySelectorAll("p.setup-error__msg");
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0]?.textContent).toBe("second");
    cleanup();
  });
});

describe("setup-error Reload button", () => {
  it("calls window.location.reload exactly once on click", () => {
    const root = makeRoot();
    const cleanup = mount(root);
    const btn = root.querySelector<HTMLButtonElement>("#setup-error-reload")!;
    btn.click();
    expect(reload).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

describe("setup-error cleanup", () => {
  it("empties the root and stops responding to state changes", () => {
    const root = makeRoot();
    const cleanup = mount(root);
    expect(root.children.length).toBeGreaterThan(0);

    cleanup();
    expect(root.innerHTML).toBe("");

    setState({ lastError: "x" });
    expect(root.innerHTML).toBe("");
  });

  it("removes the click listener so post-cleanup clicks do not call reload", () => {
    const root = makeRoot();
    const cleanup = mount(root);
    const btn = root.querySelector<HTMLButtonElement>("#setup-error-reload")!;
    cleanup();
    btn.click();
    expect(reload).not.toHaveBeenCalled();
  });
});
