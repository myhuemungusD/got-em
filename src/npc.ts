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
  rollCraps,
  rollClo,
  rollTen,
  bankTen,
  rollAgainTen,
} from "./firebase";
import { ten10kScoreCombo } from "./scoring/farkle";

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
  await joinRoom({ code, slotIdx, uid, name });
  activeNpcs.add(uid);
  return uid;
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
  if (state.isAnimatingRoll) return;

  const slot = g.slots[g.current];
  if (!slot?.uid || !activeNpcs.has(slot.uid)) return;

  const uid = slot.uid;
  const code = g.code;
  const delay = 800 + Math.random() * 1200;

  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    void executeNpcTurn(code, uid, g).catch((err: unknown) => {
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
  const { score, used } = ten10kScoreCombo(rolled);
  const keep: number[] = [];
  used.forEach((u, i) => {
    if (u) keep.push(i);
  });

  if (keep.length === 0) return;

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
