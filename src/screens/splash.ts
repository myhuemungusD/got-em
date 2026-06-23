import { setState, state } from "../state";
import { joinRoom, readGame } from "../firebase";
import { watchRoom } from "../game-bridge";
import { getSfx } from "../components";
import { saveName } from "../auth";
import { getRecentRooms, rememberRoom } from "../recent";
import { escAttr, escHtml } from "../utils/esc-html";
import { humanError } from "../utils/human-error";

interface SplashRefs {
  nameInput: HTMLInputElement;
  statusEl: HTMLDivElement;
  joinRow: HTMLDivElement;
  joinInput: HTMLInputElement;
  newGameBtn: HTMLButtonElement;
  openJoinBtn: HTMLButtonElement;
  submitJoinBtn: HTMLButtonElement;
  sfxBtn: HTMLButtonElement;
}

const SPLASH_HTML = `
  <button class="sfx-toggle" type="button" data-action="toggle-sfx"></button>
  <h1 class="splash-logo">Street<br><span class="accent">Dice</span></h1>
  <div class="splash-slogan">For The Love of The Game</div>
  <div class="splash-subtitle">play anywhere · with anyone</div>
  <div class="invite-banner" id="invite-banner" hidden>
    <div class="invite-banner-label">You're Invited To Game</div>
    <div class="invite-banner-code" id="invite-banner-code">----</div>
  </div>
  <div class="name-row">
    <label for="player-name">Your Name</label>
    <input id="player-name" name="player-name" class="field" type="text"
           maxlength="14" placeholder="Enter your name" autocomplete="off" />
  </div>
  <div class="splash-actions">
    <button class="btn btn-primary" type="button" data-action="new-game">New Game</button>
    <button class="btn btn-secondary" type="button" data-action="open-join">Join with Code</button>
  </div>
  <div class="join-row" id="join-row" hidden>
    <input id="join-code" class="field" type="text" maxlength="4"
           autocapitalize="characters" autocomplete="off" placeholder="ABCD" />
    <button class="btn btn-primary" type="button" data-action="submit-join">Join</button>
  </div>
  <div class="splash-status" id="splash-status" role="status" aria-live="polite"></div>
  <div class="recent-section" id="recent-section"></div>
  <div class="splash-disclaimer">Simulated dice — no real-money wagering</div>
  <a href="/privacy.html" class="privacy-link" target="_blank" rel="noopener">Privacy</a>
`;


function renderRecentRooms(section: HTMLElement, exclude: string | null): void {
  const rooms = getRecentRooms().filter((c) => c !== exclude);
  if (rooms.length === 0) {
    section.innerHTML = "";
    return;
  }
  section.innerHTML =
    `<div class="section-label">Recent Rooms</div>` +
    rooms
      .map(
        (code) =>
          `<button class="recent-game" type="button" data-action="join-room" data-code="${escAttr(code)}">` +
          `<div>` +
          `<div class="recent-game-code">${escHtml(code)}</div>` +
          `<div class="recent-game-meta">tap to rejoin</div>` +
          `</div>` +
          `<span class="recent-game-arrow">&rsaquo;</span>` +
          `</button>`,
      )
      .join("");
}

export function mount(root: HTMLElement): () => void {
  root.classList.add("splash");
  root.innerHTML = SPLASH_HTML;

  const refs: SplashRefs = {
    nameInput: root.querySelector<HTMLInputElement>("#player-name")!,
    statusEl: root.querySelector<HTMLDivElement>("#splash-status")!,
    joinRow: root.querySelector<HTMLDivElement>("#join-row")!,
    joinInput: root.querySelector<HTMLInputElement>("#join-code")!,
    newGameBtn: root.querySelector<HTMLButtonElement>('[data-action="new-game"]')!,
    openJoinBtn: root.querySelector<HTMLButtonElement>('[data-action="open-join"]')!,
    submitJoinBtn: root.querySelector<HTMLButtonElement>('[data-action="submit-join"]')!,
    sfxBtn: root.querySelector<HTMLButtonElement>('[data-action="toggle-sfx"]')!,
  };

  const renderSfxBtn = (): void => {
    const muted = getSfx().isMuted();
    refs.sfxBtn.textContent = muted ? "🔇" : "🔊";
    refs.sfxBtn.setAttribute("aria-label", muted ? "Unmute sounds" : "Mute sounds");
    refs.sfxBtn.setAttribute("aria-pressed", muted ? "true" : "false");
  };
  renderSfxBtn();

  const onToggleSfx = (): void => {
    const next = !getSfx().isMuted();
    getSfx().setMuted(next);
    renderSfxBtn();
    if (!next) getSfx().play("tap");
  };

  refs.nameInput.value = state.myName;

  const inviteBanner = root.querySelector<HTMLDivElement>("#invite-banner")!;
  const inviteCode = root.querySelector<HTMLDivElement>("#invite-banner-code")!;
  const recentSection = root.querySelector<HTMLDivElement>("#recent-section")!;
  const pendingRoom = state.currentRoom;

  if (pendingRoom) {
    inviteCode.textContent = pendingRoom;
    inviteBanner.hidden = false;
    refs.joinInput.value = pendingRoom;
    refs.joinRow.hidden = false;
  }

  renderRecentRooms(recentSection, pendingRoom);

  const setStatus = (msg: string): void => {
    refs.statusEl.textContent = msg;
  };

  const validateName = (): boolean => {
    const name = state.myName.trim();
    if (!name) {
      setStatus("Enter your name first");
      refs.nameInput.focus();
      return false;
    }
    return true;
  };

  const onName = (): void => {
    setState({ myName: refs.nameInput.value });
    if (refs.statusEl.textContent) setStatus("");
  };

  const onNewGame = (): void => {
    if (!validateName()) return;
    saveName(state.myName.trim());
    setStatus("");
    setState({ screen: "mode-select" });
  };

  const onOpenJoin = (): void => {
    if (!validateName()) return;
    setStatus("");
    refs.joinRow.hidden = false;
    refs.joinInput.focus();
  };

  const onJoinInput = (): void => {
    refs.joinInput.value = refs.joinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  };

  const submitJoin = async (): Promise<void> => {
    if (!validateName()) return;
    const code = refs.joinInput.value.trim().toUpperCase();
    if (code.length !== 4) {
      setStatus("Need 4 letters");
      return;
    }
    setStatus("");
    const uid = state.myUid;
    if (!uid) {
      setStatus("Still signing in — try again");
      return;
    }
    refs.submitJoinBtn.disabled = true;
    try {
      const g = await readGame(code);
      if (!g) {
        setStatus("Room not found");
        return;
      }
      if (g.status === "finished") {
        setStatus("Game is over");
        return;
      }
      if (g.playerUids.includes(uid)) {
        saveName(state.myName.trim());
        rememberRoom(code);
        setState({ currentRoom: code });
        watchRoom(code);
        return;
      }
      if (g.status === "in_progress") {
        setStatus("Game already started");
        return;
      }
      const openIdx = g.slots.findIndex((s) => !s.uid);
      if (openIdx < 0) {
        setStatus("Game is full");
        return;
      }
      await joinRoom({ code, slotIdx: openIdx, uid, name: state.myName.trim() });
      saveName(state.myName.trim());
      rememberRoom(code);
      setState({ currentRoom: code });
      watchRoom(code);
    } catch (err) {
      setStatus(humanError(err));
    } finally {
      refs.submitJoinBtn.disabled = false;
    }
  };

  const onSubmitJoin = (): void => {
    void submitJoin();
  };

  const onNameKey = (e: KeyboardEvent): void => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    refs.nameInput.blur();
    if (validateName()) {
      saveName(state.myName.trim());
      setState({ screen: "mode-select" });
    }
  };

  const onJoinKey = (e: KeyboardEvent): void => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void submitJoin();
  };

  refs.nameInput.addEventListener("input", onName);
  refs.nameInput.addEventListener("keydown", onNameKey);
  refs.newGameBtn.addEventListener("click", onNewGame);
  refs.openJoinBtn.addEventListener("click", onOpenJoin);
  refs.joinInput.addEventListener("input", onJoinInput);
  refs.joinInput.addEventListener("keydown", onJoinKey);
  refs.submitJoinBtn.addEventListener("click", onSubmitJoin);
  refs.sfxBtn.addEventListener("click", onToggleSfx);

  const onRecentClick = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action="join-room"]');
    if (!btn) return;
    const code = btn.dataset["code"];
    if (!code) return;
    refs.joinInput.value = code;
    refs.joinRow.hidden = false;
    void submitJoin();
  };
  recentSection.addEventListener("click", onRecentClick);

  return () => {
    refs.nameInput.removeEventListener("input", onName);
    refs.nameInput.removeEventListener("keydown", onNameKey);
    refs.newGameBtn.removeEventListener("click", onNewGame);
    refs.openJoinBtn.removeEventListener("click", onOpenJoin);
    refs.joinInput.removeEventListener("input", onJoinInput);
    refs.joinInput.removeEventListener("keydown", onJoinKey);
    refs.submitJoinBtn.removeEventListener("click", onSubmitJoin);
    refs.sfxBtn.removeEventListener("click", onToggleSfx);
    recentSection.removeEventListener("click", onRecentClick);
    root.classList.remove("splash");
    root.innerHTML = "";
  };
}
