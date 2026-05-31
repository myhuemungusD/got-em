import "../styles/play.css";

import { setState, state, subscribe } from "../state";
import type { AppState, GameMode, GameState, Slot, TenState } from "../state";
import { rollCraps, rollClo, rollTen, bankTen, rollAgainTen } from "../firebase";
import { createHand, renderDice, clearDice, haptic } from "../components";
import type { Hand } from "../components";
import { watchRoom, isMyTurn, currentSlot, leaveRoom } from "../game-bridge";
import { ten10kScoreCombo } from "../scoring/farkle";

interface ModeMeta {
  short: string;
  target: number | null;
}

const MODES: Record<GameMode, ModeMeta> = {
  craps: { short: "CRAPS", target: 3 },
  clo: { short: "C-LO", target: null },
  s456: { short: "4-5-6", target: null },
  ten: { short: "10K", target: 10000 },
};

const PLAY_HTML = `
  <div class="topbar">
    <button class="icon-btn" type="button" data-action="leave" aria-label="Leave game">&#9776;</button>
    <div class="topbar-title"><span id="play-mode">CRAPS</span> &middot; <span id="play-room" class="accent">----</span></div>
    <span class="icon-btn" aria-hidden="true" style="visibility:hidden"></span>
  </div>
  <div class="play-hud">
    <div class="scoreboard" id="scoreboard"></div>
  </div>
  <div class="turn-banner" id="turn-banner"></div>
  <main class="table">
    <div class="hand-area">
      <div class="hand show-fist" id="hand">
        <svg class="hand-fist" viewBox="0 0 200 220" width="100%" height="100%" aria-hidden="true">
          <g fill="#ffffff" stroke="#0a0a0a" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
            <path d="M 65 50 Q 50 55, 45 75 Q 42 95, 50 115 Q 58 130, 80 132 L 145 132 Q 168 128, 170 100 Q 170 70, 150 60 Q 130 50, 105 48 Q 85 47, 65 50 Z"/>
            <path d="M 55 95 Q 40 95, 38 108 Q 38 122, 55 124 Q 80 124, 88 115 Q 92 108, 88 102 Q 80 95, 70 95 Z"/>
          </g>
        </svg>
        <svg class="hand-open" viewBox="0 0 200 220" width="100%" height="100%" aria-hidden="true">
          <g fill="#ffffff" stroke="#0a0a0a" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
            <ellipse cx="115" cy="138" rx="38" ry="14"/>
            <path d="M 55 110 Q 48 90, 60 80 Q 75 72, 95 78 L 150 80 Q 170 82, 168 105 Q 166 128, 145 132 L 78 130 Q 50 128, 55 110 Z"/>
            <rect x="62" y="20" width="20" height="68" rx="10"/>
            <rect x="88" y="8" width="20" height="80" rx="10"/>
            <rect x="114" y="14" width="20" height="74" rx="10"/>
            <rect x="140" y="28" width="20" height="60" rx="10"/>
          </g>
        </svg>
      </div>
    </div>
    <div class="keep-bar" id="keep-bar" hidden>TURN POINTS &middot; <b id="turn-points">0</b></div>
    <div class="arena"><div class="dice-row" id="dice"></div></div>
    <div class="result-card" id="result-card" role="status" aria-live="polite"></div>
  </main>
  <div class="action-bar" id="action-bar"></div>
`;

function rolledThisStep(g: GameState): number[] {
  return g.ten?.rolledThisStep ?? [];
}

function scoringIndices(values: readonly number[]): number[] {
  const { used } = ten10kScoreCombo(values);
  const out: number[] = [];
  used.forEach((isUsed, i) => {
    if (isUsed) out.push(i);
  });
  return out;
}

function resultKind(g: GameState): string {
  switch (g.lastResult?.outcome) {
    case "win":
      return "win";
    case "farkle":
      return "farkle";
    case "loss":
      return "loss";
    case "point":
      return "point";
    default:
      return "";
  }
}

function resultText(g: GameState): string {
  const r = g.lastResult;
  if (!r) return "";
  if (g.mode === "craps") {
    if (r.label) return r.label;
    if (g.lastRoll) return `${g.lastRoll.join(" + ")} = ${String(r.sum ?? "")}`;
    return "";
  }
  if (g.mode === "clo" || g.mode === "s456") {
    const prefix = g.lastRoll ? `${g.lastRoll.join(" ")} — ` : "";
    return prefix + (r.label ?? "");
  }
  if (g.mode === "ten" && r.outcome === "farkle") return "FARKLE";
  return r.label ?? "";
}

function humanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  switch (msg) {
    case "NOT_YOUR_TURN":
      return "NOT YOUR TURN";
    case "CHOICE_PENDING":
      return "KEEP OR BANK FIRST";
    case "NEED_1000":
      return "NEED 1000 TO BANK";
    case "NOT_SCORING_SET":
      return "NOT A SCORING SET";
    case "ALL_KEPT_MUST_SCORE":
      return "ALL KEPT DICE MUST SCORE";
    case "WRONG_MODE":
      return "WRONG MODE";
    default:
      return msg.toUpperCase();
  }
}

export function mount(root: HTMLElement): () => void {
  root.classList.add("play");
  root.innerHTML = PLAY_HTML;

  const modeEl = root.querySelector<HTMLElement>("#play-mode")!;
  const roomEl = root.querySelector<HTMLElement>("#play-room")!;
  const scoreboardEl = root.querySelector<HTMLElement>("#scoreboard")!;
  const bannerEl = root.querySelector<HTMLElement>("#turn-banner")!;
  const keepBarEl = root.querySelector<HTMLElement>("#keep-bar")!;
  const turnPointsEl = root.querySelector<HTMLElement>("#turn-points")!;
  const diceEl = root.querySelector<HTMLElement>("#dice")!;
  const resultEl = root.querySelector<HTMLElement>("#result-card")!;
  const actionBarEl = root.querySelector<HTMLElement>("#action-bar")!;
  const handEl = root.querySelector<HTMLElement>("#hand")!;

  const hand: Hand = createHand(handEl, { diceContainer: diceEl });

  // The room subscription was opened earlier (lobby/mode-select) without an
  // animateRoll hook. Re-install it here so REMOTE rolls animate through the
  // hand before their dice settle. watchRoom tears down the previous sub.
  const code = state.game?.code ?? state.currentRoom ?? "";
  const stopWatch = code
    ? watchRoom(code, { animateRoll: (values) => hand.animateRoll(values) })
    : null;

  // The bridge only animates rolls it did not originate, so a local roll (mine)
  // is animated here. Track the last roll id shown so a re-render never replays
  // the throw, and seed it with whatever the bridge has already mirrored.
  let shownRollId: string | null = state.lastSeenRollId;
  let resultRollId: string | null = null;
  let resultTimer: ReturnType<typeof setTimeout> | null = null;

  function setStatus(text: string, kind: string): void {
    if (resultTimer) clearTimeout(resultTimer);
    resultEl.textContent = text;
    resultEl.className = `result-card show ${kind}`.trimEnd();
    resultTimer = setTimeout(() => {
      resultEl.classList.remove("show");
    }, 2200);
  }

  function lockActions(locked: boolean): void {
    actionBarEl.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.disabled = locked;
    });
  }

  async function runOp(op: () => Promise<void>): Promise<void> {
    const g = state.game;
    if (!g || !isMyTurn(g, state.myUid) || state.isAnimatingRoll) return;
    lockActions(true);
    try {
      await op();
    } catch (err) {
      setStatus(humanError(err), "loss");
      haptic([10, 20, 10]);
    } finally {
      lockActions(false);
    }
  }

  function onRoll(): void {
    const g = state.game;
    const byUid = state.myUid;
    if (!g || !byUid) return;
    void runOp(() => {
      switch (g.mode) {
        case "craps":
          return rollCraps({ code: g.code, byUid });
        case "clo":
        case "s456":
          return rollClo({ code: g.code, byUid });
        case "ten":
          return rollTen({ code: g.code, byUid });
      }
    });
  }

  function onBank(): void {
    const g = state.game;
    const byUid = state.myUid;
    if (!g || !byUid) return;
    const keep = [...state.pendingTenSelection];
    void runOp(() => bankTen({ code: g.code, byUid, keep }));
  }

  function onRollAgain(): void {
    const g = state.game;
    const byUid = state.myUid;
    if (!g || !byUid) return;
    const keep = [...state.pendingTenSelection];
    void runOp(() => rollAgainTen({ code: g.code, byUid, keep }));
  }

  function toggleKeep(idx: number): void {
    const g = state.game;
    if (!g || g.mode !== "ten" || !g.ten?.mustChoose) return;
    if (!isMyTurn(g, state.myUid)) return;
    if (!scoringIndices(rolledThisStep(g)).includes(idx)) {
      haptic(15);
      return;
    }
    const current = state.pendingTenSelection;
    const next = current.includes(idx)
      ? current.filter((i) => i !== idx)
      : [...current, idx];
    haptic(15);
    setState({ pendingTenSelection: next });
  }

  function onClick(e: MouseEvent): void {
    if (!(e.target instanceof Element)) return;
    const el = e.target.closest<HTMLElement>("[data-action]");
    if (!el) return;
    switch (el.dataset["action"]) {
      case "leave":
        void leaveRoom();
        return;
      case "roll":
        onRoll();
        return;
      case "ten-bank":
        onBank();
        return;
      case "ten-roll-again":
        onRollAgain();
        return;
    }
  }

  function scoreBlock(g: GameState, s: Slot): HTMLElement {
    const row = document.createElement("div");
    row.className = "player-score-row";
    const score = document.createElement("span");
    score.className = "player-score";

    if (g.mode === "ten") {
      score.textContent = s.score.toLocaleString();
      const of = document.createElement("span");
      of.className = "player-score-of";
      of.textContent = "/ 10K";
      row.append(score, of);
      return row;
    }

    if (g.mode === "craps") {
      score.textContent = String(s.score);
      const of = document.createElement("span");
      of.className = "player-score-of";
      of.textContent = `/ ${String(MODES.craps.target)}`;
      row.append(score, of);
      const wrap = document.createElement("div");
      wrap.appendChild(row);
      const progress = document.createElement("div");
      progress.className = "player-progress";
      const target = MODES.craps.target ?? 0;
      for (let k = 0; k < target; k++) {
        const pdot = document.createElement("span");
        pdot.className = k < s.score ? "pdot on" : "pdot";
        progress.appendChild(pdot);
      }
      wrap.appendChild(progress);
      return wrap;
    }

    score.textContent = String(s.score);
    row.appendChild(score);
    return row;
  }

  function detailLine(g: GameState, s: Slot): HTMLElement {
    const detail = document.createElement("div");
    detail.className = "player-detail";
    if (g.mode === "craps") {
      detail.textContent = "wins";
    } else if (g.mode === "ten") {
      detail.textContent = s.onBoard ? "on the board" : "needs 1000";
    } else {
      const rolled = s.uid ? g.matchup?.rolls?.[s.uid] : undefined;
      detail.textContent = rolled ? "rolled" : "rolling…";
    }
    return detail;
  }

  function renderScoreboard(g: GameState): void {
    scoreboardEl.replaceChildren();
    g.slots.forEach((s, i) => {
      const isCurrent = i === g.current && g.status === "in_progress";
      const isWinner = g.status === "finished" && s.uid === g.winner;
      const isMe = s.uid === state.myUid;
      const chip = document.createElement("div");
      chip.className = "player-chip";
      if (isCurrent) chip.classList.add("current");
      if (isWinner) chip.classList.add("winner");
      if (isMe) chip.classList.add("me");

      const nameRow = document.createElement("div");
      nameRow.className = "player-name-row";
      const dot = document.createElement("span");
      dot.className = "player-dot";
      const name = document.createElement("span");
      name.className = "player-name";
      name.textContent = s.name + (isMe ? " (you)" : "");
      nameRow.append(dot, name);

      chip.append(nameRow, scoreBlock(g, s), detailLine(g, s));
      scoreboardEl.appendChild(chip);
    });
  }

  function renderBanner(g: GameState): void {
    bannerEl.replaceChildren();
    if (g.status === "finished") {
      const tag = document.createElement("span");
      tag.className = "turn-tag win";
      tag.textContent = "Game Over";
      bannerEl.appendChild(tag);
      return;
    }
    const cur = currentSlot(g);
    if (!cur) return;
    const mine = isMyTurn(g, state.myUid);

    const text = document.createElement("span");
    text.append(document.createTextNode(`${cur.name} · `));
    if (g.mode === "craps") {
      const c = g.craps;
      if (c && c.phase === "point") {
        text.append(document.createTextNode("point is "));
        const accent = document.createElement("span");
        accent.className = "accent";
        accent.textContent = String(c.point);
        text.appendChild(accent);
      } else {
        text.append(document.createTextNode("come-out roll"));
      }
    } else if (g.mode === "ten") {
      text.append(
        document.createTextNode(
          g.ten?.mustChoose ? "keep scoring dice" : "roll the dice",
        ),
      );
    } else {
      text.append(document.createTextNode("roll 3 dice"));
    }

    const tag = document.createElement("span");
    tag.className = mine ? "turn-tag" : "turn-tag wait";
    tag.textContent = mine ? "Your Turn" : "Wait";
    bannerEl.append(text, tag);
  }

  function renderArena(g: GameState): void {
    if (state.isAnimatingRoll) return;
    if (!g.lastRoll) {
      clearDice(diceEl);
      return;
    }
    if (g.mode === "ten" && rolledThisStep(g).length > 0) {
      const values = rolledThisStep(g);
      const scoring = scoringIndices(values);
      const mine = isMyTurn(g, state.myUid) && Boolean(g.ten?.mustChoose);
      if (mine) {
        renderDice(diceEl, values, {
          kept: state.pendingTenSelection,
          scoring,
          onClick: toggleKeep,
        });
      } else {
        renderDice(diceEl, values, { scoring });
      }
    } else {
      renderDice(diceEl, g.lastRoll);
    }
  }

  function renderKeepBar(g: GameState): void {
    if (g.mode !== "ten" || g.status === "finished" || !g.ten) {
      keepBarEl.hidden = true;
      return;
    }
    const t: TenState = g.ten;
    keepBarEl.hidden = false;
    let pending = 0;
    if (
      isMyTurn(g, state.myUid) &&
      t.mustChoose &&
      state.pendingTenSelection.length > 0
    ) {
      const sel = state.pendingTenSelection.map((i) => rolledThisStep(g)[i] ?? 0);
      pending = ten10kScoreCombo(sel).score;
    }
    turnPointsEl.textContent = (t.turnScore + pending).toLocaleString();
    keepBarEl.classList.toggle("hot", t.kept.length === 0 && t.turnScore > 0);
  }

  function button(action: string, label: string, cls: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.dataset["action"] = action;
    b.textContent = label;
    return b;
  }

  function renderActions(g: GameState): void {
    actionBarEl.replaceChildren();
    if (g.status === "finished") return;

    if (!isMyTurn(g, state.myUid)) {
      const cur = currentSlot(g);
      const banner = document.createElement("div");
      banner.className = "waiting-banner";
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = "Waiting For";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = cur?.name ?? "?";
      const dots = document.createElement("span");
      dots.className = "dots";
      dots.append(
        document.createElement("span"),
        document.createElement("span"),
        document.createElement("span"),
      );
      name.appendChild(dots);
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "their roll will animate here";
      banner.append(label, name, hint);
      actionBarEl.appendChild(banner);
      return;
    }

    if (g.mode === "ten" && g.ten?.mustChoose) {
      const hasSel = state.pendingTenSelection.length > 0;
      const row = document.createElement("div");
      row.className = "action-row";
      const again = button("ten-roll-again", "Roll Again", "roll-btn secondary");
      const bank = button("ten-bank", "Bank", "roll-btn bank");
      again.disabled = !hasSel;
      bank.disabled = !hasSel;
      row.append(again, bank);
      actionBarEl.appendChild(row);
    } else {
      actionBarEl.appendChild(button("roll", "Roll", "roll-btn"));
    }

    if (state.isAnimatingRoll) lockActions(true);
  }

  function maybeAnimateLocalRoll(g: GameState): void {
    if (state.isAnimatingRoll) return;
    if (!g.lastRoll || !g.lastRollId || g.lastRollId === shownRollId) return;
    shownRollId = g.lastRollId;
    if (g.lastRolledBy !== state.myUid) return; // remote: bridge owns its throw
    const values = g.lastRoll;
    setState({ isAnimatingRoll: true });
    hand
      .animateRoll(values)
      .catch(() => undefined)
      .finally(() => {
        setState({ isAnimatingRoll: false });
      });
  }

  function render(s: AppState): void {
    const g = s.game;
    if (!g) {
      if (s.screen === "play") void leaveRoom();
      return;
    }
    modeEl.textContent = MODES[g.mode].short;
    roomEl.textContent = g.code;

    // Animate a fresh local roll first; finishing it flips isAnimatingRoll,
    // which re-enters render() to draw the settled dice.
    maybeAnimateLocalRoll(g);

    renderScoreboard(g);
    renderBanner(g);
    renderArena(g);
    renderKeepBar(g);
    renderActions(g);

    if (!s.isAnimatingRoll && g.lastRollId && g.lastRollId !== resultRollId) {
      resultRollId = g.lastRollId;
      const text = resultText(g);
      if (text) setStatus(text, resultKind(g));
    }
  }

  root.addEventListener("click", onClick);
  const unsubscribe = subscribe(render);
  render(state);

  return () => {
    unsubscribe();
    root.removeEventListener("click", onClick);
    if (resultTimer) clearTimeout(resultTimer);
    if (stopWatch) stopWatch();
    hand.destroy();
    root.classList.remove("play");
    root.innerHTML = "";
  };
}
