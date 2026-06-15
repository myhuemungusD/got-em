import "../styles/lobby.css";
import { state, subscribe } from "../state";
import type { GameState } from "../state";
import { joinRoom, startGame, leaveGame, lockWagers, refundWagers } from "../firebase";
import { openInviteModal, getSfx } from "../components";
import { leaveRoom } from "../game-bridge";
import { addNpc, removeNpc, isNpc, getActiveNpcUids } from "../npc";

const LOBBY_HTML = `
  <div class="lobby-topbar">
    <button class="icon-btn" type="button" data-action="leave" aria-label="Leave">&lsaquo;</button>
    <h1 class="lobby-topbar-title">Waiting <span class="accent">Room</span></h1>
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
    <div class="wager-section" id="wager-section" hidden>
      <div class="wager-row">
        <label for="wager-amount">Buy-in (chips)</label>
        <input id="wager-amount" class="field" type="number" min="0" max="100" step="1" value="0" inputmode="numeric" />
      </div>
      <div class="wager-actions">
        <button class="btn btn-secondary" type="button" data-action="lock-wager" id="wager-lock">Lock Wager</button>
        <button class="btn btn-ghost" type="button" data-action="refund-wager" id="wager-refund" hidden>Refund Pot</button>
      </div>
      <div class="wager-state" id="wager-state"></div>
      <div class="wager-disclaimer">Virtual chips only — no real money</div>
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
  if (msg === "INVALID_WAGER") return "Buy-in must be a non-negative whole number";
  if (msg === "INSUFFICIENT_CHIPS") return "Someone can't afford that buy-in";
  if (msg === "WAGER_NOT_LOCKED") return "No pot to refund";
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
  const wagerSection = root.querySelector<HTMLDivElement>("#wager-section")!;
  const wagerAmount = root.querySelector<HTMLInputElement>("#wager-amount")!;
  const wagerLockBtn = root.querySelector<HTMLButtonElement>("#wager-lock")!;
  const wagerRefundBtn = root.querySelector<HTMLButtonElement>("#wager-refund")!;
  const wagerStateEl = root.querySelector<HTMLDivElement>("#wager-state")!;
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
      getSfx().play("tap");
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
      const npcUids = getActiveNpcUids();
      if (npcUids.length > 0) {
        await Promise.allSettled(
          npcUids.map((npcUid) => leaveGame({ code: g.code, uid: npcUid })),
        );
      }
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

  const lockWager = async (): Promise<void> => {
    const g = state.game;
    if (!g || busy || !state.myUid) return;
    const raw = Number(wagerAmount.value);
    if (!Number.isInteger(raw) || raw < 0) {
      setStatus("Buy-in must be a non-negative whole number");
      return;
    }
    busy = true;
    setStatus("");
    wagerLockBtn.disabled = true;
    try {
      await lockWagers({ code: g.code, hostUid: state.myUid, amount: raw });
      getSfx().play("lock");
    } catch (err) {
      setStatus(humanError(err));
    } finally {
      busy = false;
      wagerLockBtn.disabled = false;
    }
  };

  const refundWager = async (): Promise<void> => {
    const g = state.game;
    if (!g || busy) return;
    busy = true;
    setStatus("");
    wagerRefundBtn.disabled = true;
    try {
      await refundWagers({ code: g.code });
    } catch (err) {
      setStatus(humanError(err));
    } finally {
      busy = false;
      wagerRefundBtn.disabled = false;
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

  const addCpu = async (slotIdx: number): Promise<void> => {
    const g = state.game;
    if (!g || busy) return;
    busy = true;
    setStatus("");
    try {
      await addNpc(g.code, slotIdx);
      getSfx().play("tap");
    } catch (err) {
      setStatus(humanError(err));
    } finally {
      busy = false;
    }
  };

  const kickCpu = async (uid: string): Promise<void> => {
    const g = state.game;
    if (!g || busy) return;
    busy = true;
    setStatus("");
    try {
      await removeNpc(g.code, uid);
      getSfx().play("tap");
    } catch (err) {
      setStatus(humanError(err));
    } finally {
      busy = false;
    }
  };

  const onSlotsClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    const kickBtn = target.closest<HTMLButtonElement>('[data-action="kick-cpu"]');
    if (kickBtn) {
      const uid = kickBtn.dataset["uid"];
      if (uid) void kickCpu(uid);
      return;
    }
    const cpuBtn = target.closest<HTMLButtonElement>('[data-action="add-cpu"]');
    if (cpuBtn) {
      const idx = Number(cpuBtn.dataset["slot"]);
      if (Number.isInteger(idx)) void addCpu(idx);
      return;
    }
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
    const isHost = myUid !== null && myUid === g.hostUid;

    slotsEl.innerHTML = g.slots
      .map((s, i) => {
        const taken = s.uid !== null;
        const mine = myUid !== null && s.uid === myUid;
        const isHostSlot = s.uid !== null && s.uid === g.hostUid;
        const npc = isNpc(s.uid);
        const cls = `slot-row${taken ? " taken" : ""}${mine ? " mine" : ""}${npc ? " npc" : ""}`;
        let action = "";
        if (!taken) {
          if (!alreadyIn) {
            action = `<button class="btn-claim" type="button" data-action="claim" data-slot="${i}">Take seat</button>`;
          }
          const wagerLocked = g.wager !== null && !g.wager.settled;
          if (isHost && !wagerLocked) {
            action += `<button class="btn-claim btn-cpu" type="button" data-action="add-cpu" data-slot="${i}">+ CPU</button>`;
          }
        }
        if (npc && isHost && g.status === "waiting") {
          action = `<button class="btn-claim btn-kick-cpu" type="button" data-action="kick-cpu" data-uid="${escHtml(s.uid!)}" aria-label="Remove CPU">&times;</button>`;
        }
        const nameLabel = npc ? `${escHtml(s.name)} <span class="slot-cpu-tag">CPU</span>` : (taken ? escHtml(s.name) : "Open");
        return `<div class="${cls}">
          <div class="slot-num">${i + 1}</div>
          <div class="slot-info">
            <div class="slot-name">${nameLabel}</div>
            <div class="slot-meta">${slotMeta(taken, mine, isHostSlot)}</div>
          </div>
          ${action}
        </div>`;
      })
      .join("");

    const filled = g.slots.filter((s) => s.uid !== null).length;
    const total = g.slots.length;
    const need = total - filled;

    // Wager controls: visible to host while the room is waiting.
    if (isHost) {
      wagerSection.hidden = false;
      const pot = g.wager;
      if (pot === null) {
        wagerLockBtn.hidden = false;
        wagerRefundBtn.hidden = true;
        wagerAmount.disabled = false;
        wagerStateEl.textContent = "Optional buy-in. Lock before starting.";
      } else if (!pot.settled) {
        wagerLockBtn.hidden = true;
        wagerRefundBtn.hidden = false;
        wagerAmount.disabled = true;
        wagerAmount.value = String(pot.amount);
        wagerStateEl.textContent = `Pot locked: ${pot.total} chips`;
      } else {
        wagerLockBtn.hidden = true;
        wagerRefundBtn.hidden = true;
        wagerStateEl.textContent = "Pot was refunded";
      }
    } else {
      wagerSection.hidden = true;
    }

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
  wagerLockBtn.addEventListener("click", () => {
    void lockWager();
  });
  wagerRefundBtn.addEventListener("click", () => {
    void refundWager();
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
