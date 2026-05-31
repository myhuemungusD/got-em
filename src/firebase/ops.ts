/**
 * Game ops façade.
 *
 * Public surface used by screens/state for everything that touches a
 * `games/{code}` document. The signatures mirror the prototype's Firebase
 * ops in `prototypes/gotem.html` (around lines 1211–1377) so the port is
 * a direct swap, not a redesign.
 *
 * Routing: when `TEST_MODE` is true (vitest, `vite dev` without keys) every
 * call hits the in-memory `mock` backend. Otherwise it would hit real
 * Firestore — but the real wiring is **not** in this chunk. The prod
 * branches throw `NOT_IMPLEMENTED` so callers can be built and tested now,
 * and we wire real Firestore in a follow-up that also lands `firestore.rules`.
 *
 * All writes go through `runTransaction`. There is no exported raw
 * `setDoc`/`updateDoc` — that's the security invariant from `claude.md`.
 */
import { TEST_MODE } from "./mode";
import * as mock from "./mock";
import type {
  DocRef,
  GameDoc,
  GameMode,
  Slot,
  Unsubscribe,
  TxFn,
} from "./types";

/* -------------------------------------------------------------------- */
/* Backend selection                                                    */
/* -------------------------------------------------------------------- */

function notImpl(name: string): never {
  const e = new Error(
    `[firebase/ops] ${name} not implemented in TEST_MODE=false build yet`,
  );
  (e as Error & { code?: string }).code = "NOT_IMPLEMENTED";
  throw e;
}

function gameRef(code: string): DocRef {
  if (TEST_MODE) return mock.doc(undefined, "games", code);
  return notImpl("gameRef");
}

function runTx<R>(fn: TxFn<R>): Promise<R> {
  if (TEST_MODE) return mock.runTransaction(undefined, fn);
  return notImpl("runTransaction");
}

function nowTs(): number {
  if (TEST_MODE) return mock.serverTimestamp();
  return notImpl("serverTimestamp");
}

/* -------------------------------------------------------------------- */
/* Code + slot helpers (ported from prototype)                          */
/* -------------------------------------------------------------------- */

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function genCode(len = 4): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

function emptySlots(num: number, hostUid: string, hostName: string): Slot[] {
  return Array.from({ length: num }, (_, i) => ({
    uid: i === 0 ? hostUid : null,
    name: i === 0 ? hostName : "",
    score: 0,
    onBoard: false,
  }));
}

function modeInit(mode: GameMode): Partial<GameDoc> {
  if (mode === "craps") return { craps: { phase: "comeout", point: null } };
  if (mode === "clo" || mode === "s456") return { matchup: { rolls: {} } };
  if (mode === "ten") {
    return { ten: { turnScore: 0, kept: [], rolledThisStep: [], mustChoose: false } };
  }
  return {};
}

/* -------------------------------------------------------------------- */
/* Public ops                                                           */
/* -------------------------------------------------------------------- */

export interface CreateRoomInput {
  mode: GameMode;
  numPlayers: number;
  hostUid: string;
  hostName: string;
}

/**
 * Create a fresh `games/{code}` document. Retries up to 6 times to find
 * a code that doesn't collide. Mirrors `createGame` in the prototype.
 * Returns the chosen code.
 */
export async function createRoom(input: CreateRoomInput): Promise<string> {
  const { mode, numPlayers, hostUid, hostName } = input;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = genCode(4);
    // Use a transaction so collision-check + write is atomic.
    const ok = await runTx<boolean>(async (tx) => {
      const ref = gameRef(code);
      const snap = await tx.get(ref);
      if (snap.exists()) return false;
      const slots = emptySlots(numPlayers, hostUid, hostName);
      const playerUids = slots
        .filter((s) => s.uid)
        .map((s) => s.uid as string);
      const doc: GameDoc = {
        v: 1,
        code,
        mode,
        hostUid,
        numSlots: numPlayers,
        slots,
        playerUids,
        current: 0,
        status: "waiting",
        winner: null,
        lastRoll: null,
        lastResult: null,
        lastRollId: null,
        lastRolledBy: null,
        turnStartedAt: null,
        turnDeadline: null,
        turnDurationMs: 30000,
        createdAt: nowTs(),
        updatedAt: nowTs(),
        ...modeInit(mode),
      };
      tx.set(ref, doc);
      return true;
    });
    if (ok) return code;
  }
  const e = new Error("CODE_GEN_FAILED");
  (e as Error & { code?: string }).code = "CODE_GEN_FAILED";
  throw e;
}

export interface JoinRoomInput {
  code: string;
  slotIdx: number;
  uid: string;
  name: string;
}

/**
 * Take an open slot in an existing room. Idempotent if you already hold a
 * slot. Throws stable string errors (`ROOM_NOT_FOUND`, `GAME_OVER`,
 * `ALREADY_STARTED`, `BAD_SLOT`, `SLOT_TAKEN`) — mirrors `joinGameAtSlot`.
 */
export async function joinRoom(input: JoinRoomInput): Promise<void> {
  const code = input.code.toUpperCase();
  await runTx<void>(async (tx) => {
    const ref = gameRef(code);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("ROOM_NOT_FOUND");
    const g = snap.data() as GameDoc;
    if (g.status === "finished") throw new Error("GAME_OVER");
    if (g.playerUids.includes(input.uid)) return;
    if (g.status === "in_progress") throw new Error("ALREADY_STARTED");
    const slot = g.slots[input.slotIdx];
    if (!slot) throw new Error("BAD_SLOT");
    if (slot.uid) throw new Error("SLOT_TAKEN");
    const newSlots = [...g.slots];
    newSlots[input.slotIdx] = { ...slot, uid: input.uid, name: input.name };
    const newPlayerUids = [...g.playerUids, input.uid];
    const allFilled = newSlots.every((s) => s.uid);
    const ts = nowTs();
    const patch: Partial<GameDoc> & Record<string, unknown> = {
      slots: newSlots,
      playerUids: newPlayerUids,
      status: allFilled ? "in_progress" : "waiting",
      updatedAt: ts,
    };
    if (allFilled) {
      patch.turnStartedAt = ts;
      patch.turnDeadline = ts + g.turnDurationMs;
    }
    tx.update(ref, patch);
  });
}

export interface StartGameInput {
  code: string;
  hostUid: string;
}

/**
 * Host-initiated start. Compacts filled slots, requires >=2 players, and
 * flips `status` to `in_progress`. Mirrors `startGameNow`.
 */
export async function startGame(input: StartGameInput): Promise<void> {
  await runTx<void>(async (tx) => {
    const ref = gameRef(input.code);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("ROOM_NOT_FOUND");
    const g = snap.data() as GameDoc;
    if (g.hostUid !== input.hostUid) throw new Error("NOT_HOST");
    if (g.status !== "waiting") return;
    const filled = g.slots.filter((s) => s.uid);
    if (filled.length < 2) throw new Error("TOO_FEW_PLAYERS");
    const startedAt = nowTs();
    tx.update(ref, {
      slots: filled,
      numSlots: filled.length,
      playerUids: filled.map((s) => s.uid as string),
      status: "in_progress",
      turnStartedAt: startedAt,
      turnDeadline: startedAt + g.turnDurationMs,
      updatedAt: startedAt,
    });
  });
}

export interface LeaveGameInput {
  code: string;
  uid: string;
}

/**
 * Walk away from a room. Only meaningful while `status === "waiting"`.
 * Promotes host if the leaver was host. Deletes the doc when empty.
 * Mirrors `leaveGame`.
 */
export async function leaveGame(input: LeaveGameInput): Promise<void> {
  await runTx<void>(async (tx) => {
    const ref = gameRef(input.code);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const g = snap.data() as GameDoc;
    if (g.status !== "waiting") return;
    const slotIdx = g.slots.findIndex((s) => s.uid === input.uid);
    if (slotIdx < 0) return;
    const newSlots = [...g.slots];
    newSlots[slotIdx] = { uid: null, name: "", score: 0, onBoard: false };
    const newPlayerUids = g.playerUids.filter((u) => u !== input.uid);
    let newHost = g.hostUid;
    if (g.hostUid === input.uid && newPlayerUids.length > 0) {
      newHost = newPlayerUids[0];
    }
    if (newPlayerUids.length === 0) {
      tx.delete(ref);
      return;
    }
    tx.update(ref, {
      slots: newSlots,
      playerUids: newPlayerUids,
      hostUid: newHost,
      updatedAt: nowTs(),
    });
  });
}

/**
 * Read a `games/{code}` doc once. Returns undefined if missing.
 * Useful for reconnection flow / lobby preview.
 */
export async function readGame(code: string): Promise<GameDoc | undefined> {
  if (TEST_MODE) {
    const snap = await mock.getDoc<GameDoc>(mock.doc(undefined, "games", code));
    return snap.data();
  }
  return notImpl("readGame");
}

/**
 * Subscribe to a `games/{code}` doc. Listener fires once immediately with
 * the current snapshot (or `undefined` if the doc doesn't exist), then on
 * every subsequent write. Returns an unsubscribe function.
 *
 * Mirrors `subscribeRoom` in the prototype but only handles the data path —
 * caller layers UI behavior (toasts, navigation on deletion) on top.
 */
export function subscribeGame(
  code: string,
  onNext: (doc: GameDoc | undefined) => void,
): Unsubscribe {
  if (TEST_MODE) {
    return mock.onSnapshot<GameDoc>(
      mock.doc(undefined, "games", code),
      (snap) => {
        onNext(snap.data());
      },
    );
  }
  return notImpl("subscribeGame");
}

/**
 * Run an arbitrary transactional update against a `games/{code}` doc.
 * This is the only sanctioned way for higher-level game flow (rolls,
 * scoring, turn transitions, banking, ending the game) to mutate the
 * room. Callers receive a `GameDoc` plus a `commit(patch)` helper so they
 * can't accidentally bypass `updatedAt`.
 *
 * Throws `ROOM_NOT_FOUND` if the doc doesn't exist.
 */
export async function updateGameTx<R = void>(
  code: string,
  reducer: (
    doc: GameDoc,
    commit: (patch: Partial<GameDoc>) => void,
  ) => R | Promise<R>,
): Promise<R> {
  return runTx<R>(async (tx) => {
    const ref = gameRef(code);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("ROOM_NOT_FOUND");
    const cur = snap.data() as GameDoc;
    const commit = (patch: Partial<GameDoc>): void => {
      tx.update(ref, { ...patch, updatedAt: nowTs() });
    };
    return reducer(cur, commit);
  });
}
