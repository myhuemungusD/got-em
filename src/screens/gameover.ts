import "../styles/gameover.css";
import { setState, state, subscribe, type GameState, type Slot } from "../state";
import { createRoom, leaveGame, subscribeGame } from "../firebase";
import { rememberRoom, rememberChallengers } from "../recent";

const GAMEOVER_HTML = `
  <div class="winner-trophy">🏆</div>
  <div class="winner-label">Winner</div>
  <div class="winner-name" id="winner-name">PLAYER</div>
  <div class="winner-streak"></div>
  <div class="final-score" id="final-score"></div>
  <div class="gameover-actions">
    <button class="btn btn-primary" type="button" data-action="play-again">Play Again</button>
    <button class="btn btn-secondary" type="button" data-action="new-game">New Game</button>
    <button class="btn btn-ghost" type="button" data-action="home">Home</button>
  </div>
`;

function rankLabel(idx: number, isWinner: boolean): string {
  if (isWinner) return "1st";
  if (idx === 1) return "2nd";
  if (idx === 2) return "3rd";
  return `${idx + 1}th`;
}

function formatScore(score: number, isTenMode: boolean): string {
  return isTenMode ? score.toLocaleString("en-US") : String(score);
}

function renderRow(g: GameState, slot: Slot, idx: number): HTMLDivElement {
  const isWinner = slot.uid === g.winner;
  const isMe = slot.uid === state.myUid;
  const row = document.createElement("div");
  row.className = isWinner ? "final-row winner" : "final-row";

  const rank = document.createElement("div");
  rank.className = "final-row-rank";
  rank.textContent = rankLabel(idx, isWinner);

  const name = document.createElement("div");
  name.className = "final-row-name";
  name.textContent = isMe ? `${slot.name} (you)` : slot.name;

  const scoreEl = document.createElement("div");
  scoreEl.className = "final-row-score";
  scoreEl.textContent = formatScore(slot.score, g.mode === "ten");

  row.append(rank, name, scoreEl);
  return row;
}

function render(root: HTMLElement): void {
  const g = state.game;
  if (!g) return;

  const winner = g.slots.find((s) => s.uid === g.winner);
  const winnerNameEl = root.querySelector<HTMLDivElement>("#winner-name");
  if (winnerNameEl) winnerNameEl.textContent = winner?.name ?? "PLAYER";

  const fs = root.querySelector<HTMLDivElement>("#final-score");
  if (!fs) return;
  fs.textContent = "";

  const label = document.createElement("div");
  label.className = "final-score-label";
  label.textContent = "Final Score";
  fs.appendChild(label);

  const ranked = [...g.slots].sort((a, b) => b.score - a.score);
  for (const [idx, slot] of ranked.entries()) {
    fs.appendChild(renderRow(g, slot, idx));
  }
}

export function mount(root: HTMLElement): () => void {
  root.classList.add("gameover");
  root.innerHTML = GAMEOVER_HTML;

  const g = state.game;
  if (g) {
    rememberRoom(g.code);
    if (state.myUid) rememberChallengers(g, state.myUid);
  }

  render(root);

  let roomUnsub: (() => void) | null = null;
  const dropRoomSub = (): void => {
    if (roomUnsub) {
      roomUnsub();
      roomUnsub = null;
    }
  };

  const playAgain = async (): Promise<void> => {
    const current = state.game;
    if (!current || !state.myUid) {
      setState({ screen: "mode-select" });
      return;
    }
    dropRoomSub();
    const uid = state.myUid;
    try {
      const code = await createRoom({
        mode: current.mode,
        numPlayers: current.numSlots,
        hostUid: uid,
        hostName: state.myName,
      });
      roomUnsub = subscribeGame(code, (doc) => {
        setState({ game: doc ?? null });
      });
      setState({ currentRoom: code, game: null, screen: "lobby" });
    } catch {
      setState({ screen: "mode-select" });
    }
  };

  const goHome = async (): Promise<void> => {
    dropRoomSub();
    const current = state.game;
    if (current && state.myUid) {
      try {
        await leaveGame({ code: current.code, uid: state.myUid });
      } catch {
        /* room may be finished/gone — leaving for home regardless */
      }
    }
    setState({ currentRoom: null, game: null, screen: "splash" });
  };

  const onClick = (e: MouseEvent): void => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!target) return;
    switch (target.dataset["action"]) {
      case "play-again":
        void playAgain();
        break;
      case "new-game":
        setState({ screen: "mode-select" });
        break;
      case "home":
        void goHome();
        break;
    }
  };

  const unsubscribe = subscribe(() => {
    render(root);
  });

  root.addEventListener("click", onClick);

  return () => {
    unsubscribe();
    dropRoomSub();
    root.removeEventListener("click", onClick);
    root.classList.remove("gameover");
    root.innerHTML = "";
  };
}
