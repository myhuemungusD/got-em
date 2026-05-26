import { state, subscribe, type AppState, type Screen } from "./state";
import { screens, type MountFn } from "./screens";

const SCREEN_IDS: readonly Screen[] = [
  "boot",
  "setup-error",
  "splash",
  "mode-select",
  "lobby",
  "play",
  "gameover",
];

export interface RouterOptions {
  getScreenRoot: (name: Screen) => HTMLElement | null;
  mounts?: Record<Screen, MountFn>;
}

export interface Router {
  stop: () => void;
}

export function startRouter(options: RouterOptions): Router {
  const mounts = options.mounts ?? screens;
  let currentScreen: Screen | null = null;
  let cleanup: (() => void) | null = null;

  const showOnly = (name: Screen): void => {
    for (const id of SCREEN_IDS) {
      const el = options.getScreenRoot(id);
      if (el) el.hidden = id !== name;
    }
  };

  const apply = (next: Screen): void => {
    if (next === currentScreen) return;
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    showOnly(next);
    const root = options.getScreenRoot(next);
    if (root) {
      cleanup = mounts[next](root);
    }
    currentScreen = next;
  };

  apply(state.screen);

  const unsubscribe = subscribe((s: AppState) => {
    apply(s.screen);
  });

  return {
    stop: () => {
      unsubscribe();
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
      currentScreen = null;
    },
  };
}
