import "../styles/gameover.css";
import { setState, state, subscribe, type GameState, type Slot } from "../state";
import { createRoom } from "../firebase";
import { watchRoom, leaveRoom, stopWatching } from "../game-bridge";
import { rememberRoom, rememberChallengers } from "../recent";

const STARTING_CHIPS = 100;

const GAMEOVER_HTML = `
  <div class="winner-trophy" aria-hidden="true">🏆</div>
  <div class="winner-label">Winner</div>
  <h1 class="winner-name" id="winner-name">PLAYER</h1>
  <div class="winner-streak"></div>
  <div class="final-score" id="final-score" aria-live="polite"></div>
  <div class="wager-result" id="wager-result" aria-live="polite" hidden></div>
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

  if (g.wager !== null) {
    const delta = slot.chips - STARTING_CHIPS;
    const deltaEl = document.createElement("div");
    deltaEl.className = "final-row-delta";
    if (delta > 0) {
      deltaEl.classList.add("positive");
      deltaEl.textContent = `+${delta}`;
    } else if (delta < 0) {
      deltaEl.classList.add("negative");
      deltaEl.textContent = String(delta);
    } else {
      deltaEl.textContent = "±0";
    }
    row.appendChild(deltaEl);
  }

  return row;
}

function wagerResultText(g: GameState): string {
  const pot = g.wager;
  if (!pot) return "";
  if (!pot.settled) return "Settling pot…";
  if (pot.paidTo === null) return "Pot refunded";
  const winnerName = g.slots.find((s) => s.uid === pot.paidTo)?.name ?? "Winner";
  return `${winnerName} wins ${pot.total} chips`;
}

function render(root: HTMLElement): void {
  const g = state.game;
  if (!g) return;

  const winner = g.slots.find((s) => s.uid === g.winner);
  const winnerNameEl = root.querySelector<HTMLHeadingElement>("#winner-name");
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

  const wagerEl = root.querySelector<HTMLDivElement>("#wager-result");
  if (wagerEl) {
    if (g.wager !== null) {
      wagerEl.hidden = false;
      wagerEl.textContent = wagerResultText(g);
    } else {
      wagerEl.hidden = true;
      wagerEl.textContent = "";
    }
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

  const playAgain = async (): Promise<void> => {
    const current = state.game;
    if (!current || !state.myUid) {
      setState({ screen: "mode-select" });
      return;
    }
    try {
      const code = await createRoom({
        mode: current.mode,
        numPlayers: current.numSlots,
        hostUid: state.myUid,
        hostName: state.myName,
      });
      // Hand the new room to the bridge — it owns the single room subscription
      // and derives the screen (a fresh room is "waiting" → lobby).
      setState({ currentRoom: code, game: null });
      watchRoom(code);
    } catch {
      setState({ screen: "mode-select" });
    }
  };

  const goHome = async (): Promise<void> => {
    // leaveRoom() tears down the bridge subscription, clears the room, and
    // routes to splash. The finished game needs no server-side leave.
    await leaveRoom();
  };

  const onClick = (e: MouseEvent): void => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!target) return;
    switch (target.dataset["action"]) {
      case "play-again":
        void playAgain();
        break;
      case "new-game":
        // Drop the finished room's subscription before navigating, else a
        // late doc update could route us back to gameover.
        stopWatching();
        setState({ screen: "mode-select" });
        break;
      case "home":
        void goHome();
        break;
    }
  };

  // Keep the room subscription alive on this screen when there's an unsettled
  // pot to wait on. The play screen's cleanup tears down its subscription
  // BEFORE the bridge's maybeAutoSettle write can be observed, so without
  // re-subscribing here the settled snapshot never lands and the wager line
  // stays stuck on "Settling pot…". Scoped to the case it's needed because
  // a blind re-sub would call leaveRoom() in tests/mocks that haven't seeded
  // the corresponding doc.
  const initialCode = state.currentRoom;
  const wager = state.game?.wager;
  const needsSettleWatch =
    initialCode !== null && wager !== null && wager !== undefined && !wager.settled;
  const stopWatch = needsSettleWatch ? watchRoom(initialCode) : null;

  const unsubscribe = subscribe(() => {
    render(root);
  });

  root.addEventListener("click", onClick);

  return () => {
    if (stopWatch) stopWatch();
    unsubscribe();
    root.removeEventListener("click", onClick);
    root.classList.remove("gameover");
    root.innerHTML = "";
  };
}
