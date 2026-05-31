import "../styles/lobby.css";
import { state, subscribe } from "../state";
import type { GameState } from "../state";
import { joinRoom, startGame, leaveGame } from "../firebase";
import { openInviteModal } from "../components";
import { leaveRoom } from "../game-bridge";

const LOBBY_HTML = `
  <div class="lobby-topbar">
    <button class="icon-btn" type="button" data-action="leave" aria-label="Leave">&lsaquo;</button>
    <div class="lobby-topbar-title">Waiting <span class="accent">Room</span></div>
    <div style="width:40px"></div>
  </div>
  <div class="lobby-body">
    <button class="room-code-card" type="button" data-action="copy-code" aria-label="Copy room code">
      <div class="room-code-label">Room Code</div>
      <div class="room-code-value" id="lobby-code">----</div>
      <div class="room-code-hint" id="lobby-code-hint">Tap to copy &middot; share with friends</div>
    </button>
    <button class="btn btn-primary invite-btn" type="button" data-action="invite">
      <span class="invite-btn-icon">&#8624;</span> Invite Players
    </button>
    <div class="slots-section">
      <div class="slots-header">
        <span class="slots-title">Players</span>
        <span class="slots-mode" id="lobby-mode"></span>
      </div>
      <div id="lobby-slots"></div>
    </div>
    <div class="lobby-waiting" id="lobby-waiting"></div>
    <div class="lobby-status" id="lobby-status" role="status" aria-live="polite"></div>
  </div>
  <div class="lobby-footer">
    <button class="btn btn-primary" type="button" data-action="start" id="lobby-start" hidden>Start Game</button>
    <button class="btn btn-danger" type="button" data-action="leave">Leave Game</button>
  </div>
`;

function escHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] ?? c,
  );
}

function humanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "WAGER_LOCKED") return "Pot is locked — host must refund first";
  if (msg === "SLOT_TAKEN") return "That seat was just taken";
  if (msg === "ALREADY_STARTED") return "Game already started";
  if (msg === "BAD_SLOT") return "Invalid seat";
  if (msg === "ROOM_NOT_FOUND") return "Room not found";
  if (msg === "GAME_OVER") return "Game is over";
  if (msg === "NOT_HOST") return "Only the host can start";
  if (msg === "NEED_TWO") return "Need at least 2 players";
  return msg;
}

function slotMeta(taken: boolean, mine: boolean, isHost: boolean): string {
  if (!taken) return "open slot";
  if (mine) return isHost ? "you &middot; host" : "you";
  return isHost ? "host" : "player";
}

export function mount(root: HTMLElement): () => void {
  root.classList.add("lobby");
  root.innerHTML = LOBBY_HTML;

  const codeEl = root.querySelector<HTMLDivElement>("#lobby-code")!;
  const codeHintEl = root.querySelector<HTMLDivElement>("#lobby-code-hint")!;
  const modeEl = root.querySelector<HTMLSpanElement>("#lobby-mode")!;
  const slotsEl = root.querySelector<HTMLDivElement>("#lobby-slots")!;
  const waitingEl = root.querySelector<HTMLDivElement>("#lobby-waiting")!;
  const statusEl = root.querySelector<HTMLDivElement>("#lobby-status")!;
  const startBtn = root.querySelector<HTMLButtonElement>("#lobby-start")!;
  const inviteBtn = root.querySelector<HTMLButtonElement>('[data-action="invite"]')!;
  const copyBtn = root.querySelector<HTMLButtonElement>('[data-action="copy-code"]')!;
  const leaveBtns = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-action="leave"]'),
  );

  let backdrop: HTMLDivElement | null = null;
  let modalCleanup: (() => void) | null = null;
  let busy = false;

  const setStatus = (msg: string): void => {
    statusEl.textContent = msg;
  };

  const closeInvite = (): void => {
    if (modalCleanup) {
      modalCleanup();
      modalCleanup = null;
    }
    if (backdrop) {
      backdrop.removeEventListener("click", onBackdropClick);
      backdrop.remove();
      backdrop = null;
    }
  };

  function onBackdropClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target === backdrop || target.closest('[data-action="close-modal"]')) {
      closeInvite();
    }
  }

  const claim = async (slotIdx: number): Promise<void> => {
    const g = state.game;
    if (!g || busy) return;
    if (!state.myUid) {
      setStatus("No player id — return to start");
      return;
    }
    busy = true;
    setStatus("");
    try {
      await joinRoom({
        code: g.code,
        slotIdx,
        uid: state.myUid,
        name: state.myName.trim() || "Player",
      });
    } catch (err) {
      setStatus(humanError(err));
    } finally {
      busy = false;
    }
  };

  const start = async (): Promise<void> => {
    const g = state.game;
    if (!g || busy) return;
    if (!state.myUid || state.myUid !== g.hostUid) return;
    busy = true;
    setStatus("");
    startBtn.disabled = true;
    try {
      await startGame({ code: g.code, hostUid: state.myUid });
    } catch (err) {
      setStatus(humanError(err));
    } finally {
      busy = false;
      startBtn.disabled = false;
    }
  };

  const leave = async (): Promise<void> => {
    const g = state.game;
    if (!g || busy) return;
    busy = true;
    setStatus("");
    try {
      if (state.myUid) {
        await leaveGame({ code: g.code, uid: state.myUid });
      }
      closeInvite();
      await leaveRoom();
    } catch (err) {
      setStatus(humanError(err));
    } finally {
      busy = false;
    }
  };

  const invite = (): void => {
    const g = state.game;
    if (!g) return;
    closeInvite();
    backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", onBackdropClick);
    modalCleanup = openInviteModal(g.code, backdrop);
  };

  const copyCode = (): void => {
    const g = state.game;
    if (!g) return;
    void (async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(g.code);
          codeHintEl.textContent = "Copied!";
        }
      } catch {
        codeHintEl.textContent = "Tap to copy · share with friends";
      }
    })();
  };

  const onSlotsClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>('[data-action="claim"]');
    if (!btn) return;
    const idx = Number(btn.dataset["slot"]);
    if (Number.isInteger(idx)) void claim(idx);
  };

  const render = (g: GameState): void => {
    codeEl.textContent = g.code;
    modeEl.textContent = g.mode.toUpperCase();

    const myUid = state.myUid;
    const alreadyIn = myUid !== null && g.playerUids.includes(myUid);

    slotsEl.innerHTML = g.slots
      .map((s, i) => {
        const taken = s.uid !== null;
        const mine = myUid !== null && s.uid === myUid;
        const isHost = s.uid !== null && s.uid === g.hostUid;
        const cls = `slot-row${taken ? " taken" : ""}${mine ? " mine" : ""}`;
        const action =
          !taken && !alreadyIn
            ? `<button class="btn-claim" type="button" data-action="claim" data-slot="${i}">Take seat</button>`
            : "";
        return `<div class="${cls}">
          <div class="slot-num">${i + 1}</div>
          <div class="slot-info">
            <div class="slot-name">${taken ? escHtml(s.name) : "Open"}</div>
            <div class="slot-meta">${slotMeta(taken, mine, isHost)}</div>
          </div>
          ${action}
        </div>`;
      })
      .join("");

    const filled = g.slots.filter((s) => s.uid !== null).length;
    const total = g.slots.length;
    const need = total - filled;

    const isHost = myUid !== null && myUid === g.hostUid;
    if (isHost) {
      waitingEl.innerHTML =
        need > 0
          ? `<span class="pulse">Waiting for ${need} more</span>`
          : "Table's full";
      startBtn.hidden = false;
      startBtn.disabled = filled < 2 || busy;
      startBtn.textContent =
        filled >= 2 ? `Start with ${filled} ${filled === 1 ? "player" : "players"}` : "Start Game";
    } else {
      waitingEl.innerHTML = `<span class="pulse">Waiting for host to start</span>`;
      startBtn.hidden = true;
    }
  };

  const onState = (): void => {
    const g = state.game;
    if (!g) return;
    render(g);
  };

  slotsEl.addEventListener("click", onSlotsClick);
  inviteBtn.addEventListener("click", invite);
  copyBtn.addEventListener("click", copyCode);
  startBtn.addEventListener("click", () => {
    void start();
  });
  for (const btn of leaveBtns) {
    btn.addEventListener("click", () => {
      void leave();
    });
  }

  const unsubscribe = subscribe(onState);

  if (state.game) render(state.game);

  return () => {
    unsubscribe();
    closeInvite();
    slotsEl.removeEventListener("click", onSlotsClick);
    root.classList.remove("lobby");
    root.innerHTML = "";
  };
}
