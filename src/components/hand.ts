import { buildDie, haptic } from "./dice";

export interface Hand {
  animateRoll(values: readonly number[]): Promise<void>;
  destroy(): void;
}

export interface HandOpts {
  diceContainer?: HTMLElement;
  sleep?: (ms: number) => Promise<void>;
}

const SHAKE_MS = 500;
const THROW_MS = 370;
const OPEN_MS = 60;
const SETTLE_MS = 900;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export function createHand(container: HTMLElement, opts: HandOpts = {}): Hand {
  const sleep = opts.sleep ?? defaultSleep;
  // Resolve the dice arena lazily at roll time: `#dice` is a document-unique
  // id that may live in a sibling subtree of the hand (e.g. `.arena` next to
  // `.hand-area`), and may mount after this factory runs. A document-scoped
  // lookup is robust to both; callers can still pass `diceContainer` to pin it.
  const resolveArena = (): HTMLElement | null =>
    opts.diceContainer ?? document.getElementById("dice");

  let cancelled = false;

  async function run(values: readonly number[]): Promise<void> {
    container.classList.remove("throw", "shake", "show-open");
    container.classList.add("show-fist");
    container.classList.add("shake");
    haptic(20);
    await sleep(SHAKE_MS);
    if (cancelled) return;

    container.classList.remove("shake");
    container.classList.add("throw");
    await sleep(THROW_MS);
    if (cancelled) return;

    container.classList.remove("show-fist");
    container.classList.add("show-open");
    haptic(30);
    await sleep(OPEN_MS);
    if (cancelled) return;

    const arena = resolveArena();
    if (arena) {
      arena.replaceChildren();
      values.forEach((v, idx) => {
        const die = buildDie(v, { id: idx });
        die.classList.add("tumbling");
        arena.appendChild(die);
      });
    }
    haptic(40);
    await sleep(SETTLE_MS);
    if (cancelled) return;

    haptic(60);
    container.classList.remove("throw", "show-open");
    container.classList.add("show-fist");
  }

  function animateRoll(values: readonly number[]): Promise<void> {
    return run(values);
  }

  function destroy(): void {
    cancelled = true;
    container.classList.remove("shake", "throw", "show-open");
    container.classList.add("show-fist");
  }

  return { animateRoll, destroy };
}
