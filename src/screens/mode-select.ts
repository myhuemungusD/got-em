import "../styles/mode-select.css";
import { setState, state, subscribe, type GameMode } from "../state";
import { MODES } from "../modes";
import { createRoom } from "../firebase";
import { watchRoom } from "../game-bridge";
import { escHtml } from "../utils/esc-html";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

const PIP_LAYOUTS: Readonly<Record<GameMode, readonly (readonly string[])[]>> = {
  craps: [
    ["tl", "br"],
    ["tl", "tr", "mc", "bl", "br"],
  ],
  clo: [["mc"], ["tl", "br"], ["tl", "mc", "br"]],
  s456: [
    ["tl", "tr", "bl", "br"],
    ["tl", "tr", "mc", "bl", "br"],
    ["tl", "tr", "ml", "mr", "bl", "br"],
  ],
  ten: [
    ["mc"],
    ["tl", "br"],
    ["tl", "mc", "br"],
    ["tl", "tr", "bl", "br"],
    ["tl", "tr", "mc", "bl", "br"],
    ["tl", "tr", "ml", "mr", "bl", "br"],
  ],
};

function die(pips: readonly string[]): string {
  const cells = pips.map((p) => `<div class="mini-pip ${p}"></div>`).join("");
  return `<div class="mini-die">${cells}</div>`;
}

function modeIcon(mode: GameMode): string {
  const dice = PIP_LAYOUTS[mode].map(die).join("");
  return `<div class="dice-stack">${dice}</div>`;
}

const SCREEN_HTML = `
  <div class="topbar">
    <button class="icon-btn" type="button" data-action="back" aria-label="Back">‹</button>
    <h1 class="topbar-title">New <span class="accent">Game</span></h1>
    <div style="width:40px"></div>
  </div>
  <div class="screen-body">
    <div class="pick-label">Pick a Game</div>
    <div class="mode-grid" id="mode-grid"></div>
    <div class="config-section">
      <div class="config-label">How Many Players</div>
      <div class="num-stepper">
        <button class="num-stepper-btn" type="button" data-action="players-down" aria-label="Fewer players">−</button>
        <span class="num-stepper-val" id="player-count-val">2</span>
        <button class="num-stepper-btn" type="button" data-action="players-up" aria-label="More players">+</button>
      </div>
    </div>
  </div>
  <div class="screen-footer">
    <button class="btn btn-primary" type="button" data-action="create-game" id="btn-create-game">Create Game</button>
    <button class="btn btn-ghost" type="button" data-action="back">Cancel</button>
  </div>
`;

function clampPlayers(n: number): number {
  return Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, n));
}

export function mount(root: HTMLElement): () => void {
  root.classList.add("mode-select");
  root.innerHTML = SCREEN_HTML;

  const grid = root.querySelector<HTMLDivElement>("#mode-grid")!;
  const countEl = root.querySelector<HTMLSpanElement>("#player-count-val")!;
  const downBtn = root.querySelector<HTMLButtonElement>('[data-action="players-down"]')!;
  const upBtn = root.querySelector<HTMLButtonElement>('[data-action="players-up"]')!;
  const createBtn = root.querySelector<HTMLButtonElement>("#btn-create-game")!;
  const backBtns = root.querySelectorAll<HTMLButtonElement>('[data-action="back"]');

  grid.innerHTML = MODES.map(
    (m) => `
    <button class="mode-card" type="button" data-action="select-mode" data-mode="${m.id}">
      <div class="mode-icon">${modeIcon(m.id)}</div>
      <div>
        <div class="mode-name">${escHtml(m.name)}</div>
        <div class="mode-target">${escHtml(m.tagline)}</div>
      </div>
    </button>`,
  ).join("");

  const cards = Array.from(grid.querySelectorAll<HTMLButtonElement>(".mode-card"));

  let busy = false;

  const render = (): void => {
    for (const card of cards) {
      card.classList.toggle("selected", card.dataset.mode === state.selectedMode);
    }
    countEl.textContent = String(state.selectedPlayerCount);
    downBtn.disabled = busy || state.selectedPlayerCount <= MIN_PLAYERS;
    upBtn.disabled = busy || state.selectedPlayerCount >= MAX_PLAYERS;
    createBtn.disabled = busy || !state.myUid;
  };

  const onCardClick = (e: Event): void => {
    if (busy) return;
    const card = (e.currentTarget as HTMLButtonElement).dataset.mode;
    if (card) setState({ selectedMode: card as GameMode });
  };

  const onDown = (): void => {
    setState({ selectedPlayerCount: clampPlayers(state.selectedPlayerCount - 1) });
  };

  const onUp = (): void => {
    setState({ selectedPlayerCount: clampPlayers(state.selectedPlayerCount + 1) });
  };

  const onBack = (): void => {
    if (busy) return;
    setState({ screen: "splash" });
  };

  const createGame = async (): Promise<void> => {
    if (busy || !state.myUid) return;
    busy = true;
    render();
    try {
      const code = await createRoom({
        mode: state.selectedMode,
        numPlayers: state.selectedPlayerCount,
        hostUid: state.myUid,
        hostName: state.myName,
      });
      setState({ currentRoom: code });
      watchRoom(code);
    } catch (err) {
      setState({ lastError: err instanceof Error ? err.message : String(err) });
      busy = false;
      render();
    }
  };

  const onCreate = (): void => {
    void createGame();
  };

  for (const card of cards) card.addEventListener("click", onCardClick);
  downBtn.addEventListener("click", onDown);
  upBtn.addEventListener("click", onUp);
  createBtn.addEventListener("click", onCreate);
  for (const btn of backBtns) btn.addEventListener("click", onBack);

  const unsubscribe = subscribe(render);
  render();

  return () => {
    unsubscribe();
    for (const card of cards) card.removeEventListener("click", onCardClick);
    downBtn.removeEventListener("click", onDown);
    upBtn.removeEventListener("click", onUp);
    createBtn.removeEventListener("click", onCreate);
    for (const btn of backBtns) btn.removeEventListener("click", onBack);
    root.classList.remove("mode-select");
    root.innerHTML = "";
  };
}
