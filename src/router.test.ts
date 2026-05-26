import { describe, it, expect, beforeEach } from "vitest";
import { startRouter } from "./router";
import { screens } from "./screens";
import { setState, resetState, type Screen } from "./state";

const SCREEN_NAMES: Screen[] = [
  "boot",
  "setup-error",
  "splash",
  "mode-select",
  "lobby",
  "play",
  "gameover",
];

function buildDom(): Record<Screen, HTMLElement> {
  document.body.innerHTML = "";
  const roots = {} as Record<Screen, HTMLElement>;
  for (const name of SCREEN_NAMES) {
    const section = document.createElement("section");
    section.id = `screen-${name}`;
    section.className = "screen";
    section.hidden = name !== "boot";
    document.body.appendChild(section);
    roots[name] = section;
  }
  return roots;
}

function getRoot(name: Screen): HTMLElement | null {
  return document.getElementById(`screen-${name}`);
}

beforeEach(() => {
  resetState();
  buildDom();
});

describe("screens registry", () => {
  it("has a mount function for every screen in the Screen union", () => {
    for (const name of SCREEN_NAMES) {
      expect(typeof screens[name]).toBe("function");
    }
    expect(Object.keys(screens).sort()).toEqual([...SCREEN_NAMES].sort());
  });
});

describe("startRouter", () => {
  it("mounts the initial screen (boot) on start", () => {
    const router = startRouter({ getScreenRoot: getRoot });
    const boot = getRoot("boot")!;
    expect(boot.hidden).toBe(false);
    expect(boot.textContent).toBe("boot screen — TODO");
    router.stop();
  });

  it("hides every non-active screen", () => {
    const router = startRouter({ getScreenRoot: getRoot });
    for (const name of SCREEN_NAMES) {
      const el = getRoot(name)!;
      expect(el.hidden).toBe(name !== "boot");
    }
    router.stop();
  });

  it("unmounts previous screen and mounts the next when state.screen changes", () => {
    const router = startRouter({ getScreenRoot: getRoot });
    const boot = getRoot("boot")!;
    const splash = getRoot("splash")!;

    expect(boot.textContent).toBe("boot screen — TODO");

    setState({ screen: "splash" });

    expect(boot.hidden).toBe(true);
    expect(boot.textContent).toBe("");
    expect(splash.hidden).toBe(false);
    expect(splash.querySelector('input[name="player-name"]')).not.toBeNull();

    router.stop();
  });

  it("calls cleanup before mounting the next screen", () => {
    const order: string[] = [];
    const mounts = {} as Record<Screen, (root: HTMLElement) => () => void>;
    for (const name of SCREEN_NAMES) {
      mounts[name] = (_root) => {
        order.push(`mount:${name}`);
        return () => {
          order.push(`cleanup:${name}`);
        };
      };
    }

    const router = startRouter({ getScreenRoot: getRoot, mounts });
    expect(order).toEqual(["mount:boot"]);

    setState({ screen: "splash" });
    expect(order).toEqual(["mount:boot", "cleanup:boot", "mount:splash"]);

    setState({ screen: "lobby" });
    expect(order).toEqual([
      "mount:boot",
      "cleanup:boot",
      "mount:splash",
      "cleanup:splash",
      "mount:lobby",
    ]);

    router.stop();
    expect(order[order.length - 1]).toBe("cleanup:lobby");
  });

  it("ignores no-op state changes that do not affect screen", () => {
    const counts: Record<string, number> = {};
    const mounts = {} as Record<Screen, (root: HTMLElement) => () => void>;
    for (const name of SCREEN_NAMES) {
      mounts[name] = () => {
        counts[name] = (counts[name] ?? 0) + 1;
        return () => {};
      };
    }
    const router = startRouter({ getScreenRoot: getRoot, mounts });
    setState({ myName: "Jay" });
    setState({ myName: "Jay2" });
    expect(counts["boot"]).toBe(1);
    router.stop();
  });
});
