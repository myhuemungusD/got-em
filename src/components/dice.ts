export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

type PipClass = "p-tl" | "p-tr" | "p-ml" | "p-mc" | "p-mr" | "p-bl" | "p-br";

const PIP_LAYOUT: Record<DieValue, readonly PipClass[]> = {
  1: ["p-mc"],
  2: ["p-tl", "p-br"],
  3: ["p-tl", "p-mc", "p-br"],
  4: ["p-tl", "p-tr", "p-bl", "p-br"],
  5: ["p-tl", "p-tr", "p-mc", "p-bl", "p-br"],
  6: ["p-tl", "p-tr", "p-ml", "p-mr", "p-bl", "p-br"],
};

const FACE_ROTATIONS: Record<DieValue, string> = {
  1: "rotateX(0deg) rotateY(0deg)",
  2: "rotateX(0deg) rotateY(90deg)",
  3: "rotateX(90deg) rotateY(0deg)",
  4: "rotateX(-90deg) rotateY(0deg)",
  5: "rotateX(0deg) rotateY(-90deg)",
  6: "rotateX(0deg) rotateY(180deg)",
};

function asDieValue(value: number): DieValue {
  const clamped = Math.min(6, Math.max(1, Math.round(value)));
  return clamped as DieValue;
}

export function buildFace(value: number): HTMLElement {
  const die = asDieValue(value);
  const f = document.createElement("div");
  f.className = "face f" + die;
  for (const cls of PIP_LAYOUT[die]) {
    const p = document.createElement("div");
    p.className = "pip " + cls;
    f.appendChild(p);
  }
  return f;
}

export interface DieOpts {
  kept?: boolean;
  scoring?: boolean;
  id?: number;
}

export function buildDie(value: number, opts: DieOpts = {}): HTMLElement {
  const die = asDieValue(value);
  const d = document.createElement("div");
  d.className = "die";
  d.dataset["value"] = String(die);
  if (opts.kept) d.classList.add("kept");
  if (opts.scoring) d.classList.add("scoring");
  if (opts.id !== undefined) d.dataset["id"] = String(opts.id);
  for (let v = 1; v <= 6; v++) d.appendChild(buildFace(v));
  const rot = FACE_ROTATIONS[die];
  d.style.setProperty("--final-rot", rot);
  d.style.transform = rot;
  return d;
}

export interface RenderDiceOpts {
  kept?: number[];
  scoring?: number[];
  onClick?: (idx: number) => void;
}

export function renderDice(
  container: HTMLElement,
  values: readonly number[],
  opts: RenderDiceOpts = {},
): void {
  const kept = opts.kept;
  const scoring = opts.scoring;
  const onClick = opts.onClick;
  container.replaceChildren();
  values.forEach((v, idx) => {
    const die = buildDie(v, {
      kept: kept ? kept.includes(idx) : false,
      scoring: scoring ? scoring.includes(idx) : false,
      id: idx,
    });
    if (onClick) die.addEventListener("click", () => onClick(idx));
    container.appendChild(die);
  });
}

export function clearDice(container: HTMLElement): void {
  container.replaceChildren();
}

export function haptic(ms: number | number[]): void {
  if (typeof navigator === "undefined") return;
  const vibrate = navigator.vibrate?.bind(navigator);
  if (!vibrate) return;
  try {
    vibrate(ms);
  } catch {
    // Vibration may throw on some platforms (e.g. denied permission); ignore.
  }
}
