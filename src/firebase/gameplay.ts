/**
 * Gameplay ops — the transactional roll/score/win-detect handlers that drive
 * a Got Em game forward. Ported verbatim (semantics-wise) from the validated
 * prototype `prototypes/gotem.html`:
 *   - rollCraps        ~1645–1672
 *
 * Every mutation flows through `updateGameTx` (the sanctioned transactional
 * reducer in ops.ts) — never a raw setDoc/updateDoc. Dice are rolled INSIDE
 * the reducer via the scoring `rollN` primitive, whose RNG is swappable through
 * `setDieSource` (see dice.ts) so tests can force any outcome.
 *
 * UI/animation/haptics from the prototype are intentionally dropped — this
 * chunk is backend only.
 */
import { TEST_MODE } from "./mode";
import * as mock from "./mock";
import { updateGameTx } from "./ops";
import type { GameDoc, RollResult, Slot } from "./types";
import { rollN } from "../scoring/dice";
import { crapsResolve } from "../scoring/craps";

/* -------------------------------------------------------------------- */
/* Per-mode win targets (ported from prototype MODES, lines ~1059–1063) */
/* -------------------------------------------------------------------- */

const CRAPS_TARGET = 3;

/* -------------------------------------------------------------------- */
/* Local helpers                                                        */
/* -------------------------------------------------------------------- */

function notImpl(name: string): never {
  const e = new Error(
    `[firebase/gameplay] ${name} not implemented in TEST_MODE=false build yet`,
  );
  (e as Error & { code?: string }).code = "NOT_IMPLEMENTED";
  throw e;
}

function nowTs(): number {
  if (TEST_MODE) return mock.serverTimestamp();
  return notImpl("serverTimestamp");
}

/**
 * Fresh roll id. Ported from the prototype's `genId` (line ~1217):
 * `Math.random().toString(36)` + a time suffix. Used to tag each roll so
 * subscribers can distinguish a genuinely new roll from a re-render.
 */
export function genId(): string {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  );
}

/** Restamp the turn clock (mirrors advanceTurn / startGame in ops.ts). */
function turnStamps(g: GameDoc): {
  turnStartedAt: number;
  turnDeadline: number;
} {
  const startedAt = nowTs();
  return { turnStartedAt: startedAt, turnDeadline: startedAt + g.turnDurationMs };
}

/** Index of the next seat, wrapping. */
function nextCurrent(g: GameDoc): number {
  return (g.current + 1) % g.numSlots;
}

/**
 * Common gate for every gameplay op: game must be live and it must be the
 * caller's turn. Returns the active slot (guaranteed non-null on success) so
 * callers don't re-index under `noUncheckedIndexedAccess`.
 */
function assertTurn(g: GameDoc, byUid: string): Slot {
  if (g.status !== "in_progress") throw new Error("NOT_IN_PROGRESS");
  const slot = g.slots[g.current];
  if (!slot || slot.uid !== byUid) throw new Error("NOT_YOUR_TURN");
  return slot;
}

/** Base patch fields every roll stamps. */
function rollMeta(
  roll: number[],
  result: RollResult,
  byUid: string,
): Pick<GameDoc, "lastRoll" | "lastResult" | "lastRollId" | "lastRolledBy"> {
  return {
    lastRoll: roll,
    lastResult: result,
    lastRollId: genId(),
    lastRolledBy: byUid,
  };
}

/* -------------------------------------------------------------------- */
/* Public contracts                                                     */
/* -------------------------------------------------------------------- */

export interface RollInput {
  code: string;
  byUid: string;
}

/* -------------------------------------------------------------------- */
/* Craps                                                                */
/* -------------------------------------------------------------------- */

/**
 * Roll two dice for craps. Comeout: 7/11 wins the round (+1 score), 2/3/12
 * loses it, anything else sets the point. Point phase: rolling the point wins
 * the round, 7 loses it, anything else continues the same turn. A round win/
 * loss resets craps to comeout and advances unless the winner has reached the
 * 3-round target — then the game finishes. Port of `crapsRoll` (~1645–1672).
 */
export async function rollCraps(input: RollInput): Promise<void> {
  await updateGameTx(input.code, (g, commit) => {
    assertTurn(g, input.byUid);
    const craps = g.craps ?? { phase: "comeout", point: null };
    const roll = rollN(2);
    const result = crapsResolve(roll, craps.phase, craps.point);
    const meta = rollMeta(roll, result, input.byUid);

    // Continue same turn: set/keep the point, restamp deadline.
    if (result.outcome === "point") {
      commit({
        ...meta,
        craps: { phase: "point", point: result.point },
        ...turnStamps(g),
      });
      return;
    }
    if (result.outcome === "continue") {
      commit({ ...meta, ...turnStamps(g) });
      return;
    }

    // Round ended (win or loss). Reset craps to comeout.
    const slots = [...g.slots];
    const cur = slots[g.current]!;
    if (result.outcome === "win") {
      slots[g.current] = { ...cur, score: cur.score + 1 };
    }
    const winnerScore = slots[g.current]!.score;
    if (winnerScore >= CRAPS_TARGET) {
      commit({
        ...meta,
        slots,
        craps: { phase: "comeout", point: null },
        status: "finished",
        winner: cur.uid,
      });
      return;
    }
    commit({
      ...meta,
      slots,
      craps: { phase: "comeout", point: null },
      current: nextCurrent(g),
      ...turnStamps(g),
    });
  });
}
