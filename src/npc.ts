/**
 * NPC (computer opponent) module.
 *
 * Adds synthetic players to a room that auto-play when it's their turn.
 * The host's browser drives all NPC actions — no server needed, consistent
 * with the "no Cloud Functions" architecture from claude.md.
 *
 * NPCs are identified by a uid prefix. The host tracks which NPCs they
 * created in a module-level set; game-bridge calls `maybeNpcTurn` on every
 * state update so the NPC reacts to turn changes.
 */
import type { GameState } from "./state";
import { state } from "./state";
import {
  joinRoom,
  leaveGame,
  rollCraps,
  rollClo,
  rollTen,
  bankTen,
  rollAgainTen,
} from "./firebase";
import { ten10kScoreCombo, scoringIndices } from "./scoring/farkle";

const NPC_UID_PREFIX = "npc-";

const NPC_NAMES = ["Slim", "Dice", "Lucky", "Bones", "Shadow", "Ace"];
let nameIdx = 0;

const activeNpcs = new Set<string>();
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

export function isNpc(uid: string | null): boolean {
  return uid !== null && uid.startsWith(NPC_UID_PREFIX);
}

function genNpcUid(): string {
  return NPC_UID_PREFIX + Math.random().toString(36).slice(2, 10);
}

function nextNpcName(): string {
  const name = NPC_NAMES[nameIdx % NPC_NAMES.length]!;
  nameIdx++;
  return name;
}

export async function addNpc(code: string, slotIdx: number): Promise<string> {
  const uid = genNpcUid();
  const name = nextNpcName();
  activeNpcs.add(uid);
  try {
    await joinRoom({ code, slotIdx, uid, name });
  } catch (err) {
    activeNpcs.delete(uid);
    throw err;
  }
  return uid;
}

export async function removeNpc(code: string, uid: string): Promise<void> {
  activeNpcs.delete(uid);
  await leaveGame({ code, uid });
}

export function clearNpcs(): void {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  activeNpcs.clear();
  nameIdx = 0;
}

export function hasActiveNpcs(): boolean {
  return activeNpcs.size > 0;
}

export function getActiveNpcUids(): string[] {
  return Array.from(activeNpcs);
}

/**
 * Called from game-bridge on every doc update. If the current player is one
 * of our NPCs, schedule their action after a short delay so the game feels
 * natural.
 */
export function maybeNpcTurn(g: GameState): void {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  if (g.status !== "in_progress") return;

  const slot = g.slots[g.current];
  if (!slot?.uid || !activeNpcs.has(slot.uid)) return;

  const delay = 800 + Math.random() * 1200;

  // Re-validate at fire time against the CURRENT doc, not the one captured
  // at schedule time: the turn may have moved (auto-advance) meanwhile.
  // If a roll animation is still playing, re-defer instead of skipping —
  // an early return here is a lost wakeup (nothing re-invokes us when the
  // animation ends) and the NPC would stall out its whole 30s turn.
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    // state.game is kept fresh by game-bridge; fall back to the scheduling
    // doc for direct callers (tests) that don't populate app state.
    const cur = state.game ?? g;
    if (cur.status !== "in_progress") return;
    const curSlot = cur.slots[cur.current];
    if (!curSlot?.uid || !activeNpcs.has(curSlot.uid)) return;
    if (state.isAnimatingRoll) {
      maybeNpcTurn(cur);
      return;
    }
    void executeNpcTurn(cur.code, curSlot.uid, cur).catch((err: unknown) => {
      console.warn("[npc] turn failed:", err instanceof Error ? err.message : err);
    });
  }, delay);
}

async function executeNpcTurn(
  code: string,
  uid: string,
  g: GameState,
): Promise<void> {
  switch (g.mode) {
    case "craps":
      await rollCraps({ code, byUid: uid });
      break;
    case "clo":
    case "s456":
      await rollClo({ code, byUid: uid });
      break;
    case "ten":
      await npcTenAction(code, uid, g);
      break;
  }
}

async function npcTenAction(
  code: string,
  uid: string,
  g: GameState,
): Promise<void> {
  const t = g.ten;
  if (!t?.mustChoose) {
    await rollTen({ code, byUid: uid });
    return;
  }

  const rolled = t.rolledThisStep;
  const { score } = ten10kScoreCombo(rolled);
  const keep = scoringIndices(rolled);

  if (keep.length === 0) {
    // Unreachable in practice: mustChoose is only set when maxScore > 0, so
    // there is always at least one scoring die. Warn so a violation is visible
    // rather than silently stalling the table until the 30s turn timer.
    console.warn(
      "[npc] ten action: no scoring dice in mustChoose state",
      rolled,
    );
    return;
  }

  const turnScoreAfterKeep = t.turnScore + score;
  const slot = g.slots[g.current];
  const onBoard = slot?.onBoard ?? false;

  if (!onBoard && turnScoreAfterKeep < 1000) {
    await rollAgainTen({ code, byUid: uid, keep });
    return;
  }

  const r = Math.random();
  const shouldBank =
    turnScoreAfterKeep >= 3000 ||
    (turnScoreAfterKeep >= 1500 && r > 0.3) ||
    (turnScoreAfterKeep >= 1000 && r > 0.6) ||
    (onBoard && turnScoreAfterKeep >= 300 && r > 0.75);

  if (shouldBank) {
    await bankTen({ code, byUid: uid, keep });
  } else {
    await rollAgainTen({ code, byUid: uid, keep });
  }
}
