/**
 * Gameplay ops — the transactional roll/score/win-detect handlers that drive
 * a Got Em game forward. Ported verbatim (semantics-wise) from the validated
 * prototype `prototypes/gotem.html`:
 *   - rollCraps        ~1645–1672
 *   - rollClo / s456   ~1674–1708 (one engine; `mode` only selects scoring)
 *   - rollTen          ~1710–1735
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
import { cloResolve } from "../scoring/clo";
import { ten10kScoreCombo } from "../scoring/farkle";

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

/* -------------------------------------------------------------------- */
/* C-Lo / 4-5-6                                                         */
/* -------------------------------------------------------------------- */

/**
 * Roll three dice for c-lo / 4-5-6 (same engine; `mode` only labels the room).
 * An indeterminate roll ("reroll") rolls again on the same turn. Otherwise the
 * player's result is recorded into `matchup.rolls[uid]` and the turn advances.
 * Once every seated player has a recorded roll, the highest rank wins. On a tie
 * for the top rank, the tied players' rolls are cleared and `current` is reset
 * to the first tied seat so they re-roll. Port of `cloRoll` (~1674–1708).
 *
 * Note on storage: the prototype stashes the whole result object under the uid.
 * Our typed `MatchupState.rolls` is `Record<string, number[]>`, so we persist
 * the dice array and recompute rank via `cloResolve` when ranking — equivalent,
 * since the rank is a pure function of the dice.
 */
export async function rollClo(input: RollInput): Promise<void> {
  await updateGameTx(input.code, (g, commit) => {
    const slot = assertTurn(g, input.byUid);
    const roll = rollN(3);
    const result = cloResolve(roll);
    const meta = rollMeta(roll, result, input.byUid);

    if (result.outcome === "reroll") {
      commit({ ...meta, ...turnStamps(g) });
      return;
    }

    const rollerUid = slot.uid as string;
    const matchupRolls: Record<string, number[]> = {
      ...(g.matchup?.rolls ?? {}),
    };
    matchupRolls[rollerUid] = roll;

    const seated = g.slots.filter((s): s is Slot & { uid: string } =>
      Boolean(s.uid),
    );
    const allDone = seated.every((s) => matchupRolls[s.uid] !== undefined);

    if (!allDone) {
      commit({
        ...meta,
        matchup: { rolls: matchupRolls },
        current: nextCurrent(g),
        ...turnStamps(g),
      });
      return;
    }

    // Everyone has rolled — rank by recomputed combo rank (highest wins).
    const ranked = seated
      .map((s) => {
        const dice = matchupRolls[s.uid]!;
        const r = cloResolve(dice);
        return { uid: s.uid, rank: r.rank ?? Number.NEGATIVE_INFINITY };
      })
      .sort((a, b) => b.rank - a.rank);

    const top = ranked[0]!;
    const tied = ranked.filter((x) => x.rank === top.rank);

    if (tied.length > 1) {
      // Tie: clear the tied players' rolls and reset current to the first
      // tied seat so they re-roll.
      const tiedUids = new Set(tied.map((t) => t.uid));
      for (const uid of tiedUids) delete matchupRolls[uid];
      const firstTiedSlotIdx = g.slots.findIndex(
        (s) => s.uid !== null && tiedUids.has(s.uid),
      );
      commit({
        ...meta,
        matchup: { rolls: matchupRolls },
        current: firstTiedSlotIdx,
        ...turnStamps(g),
      });
      return;
    }

    // Sole winner: +1 score, finish.
    const slots = [...g.slots];
    const winnerIdx = slots.findIndex((s) => s.uid === top.uid);
    const winSlot = slots[winnerIdx]!;
    slots[winnerIdx] = { ...winSlot, score: winSlot.score + 1 };
    commit({
      ...meta,
      matchup: { rolls: matchupRolls },
      slots,
      status: "finished",
      winner: top.uid,
    });
  });
}

/* -------------------------------------------------------------------- */
/* 10,000 (farkle) — initial roll                                       */
/* -------------------------------------------------------------------- */

/**
 * Initial roll of a 10,000 turn: roll the (6 - kept) open dice. With no kept
 * dice that's all 6. No scoring dice → Farkle: forfeit `turnScore`, reset ten
 * state, advance. Otherwise stash the rolled dice and flag `mustChoose`, then
 * wait for bankTen / rollAgainTen. Port of `ten10kRoll` (~1710–1735).
 */
export async function rollTen(input: RollInput): Promise<void> {
  await updateGameTx(input.code, (g, commit) => {
    assertTurn(g, input.byUid);
    const t = g.ten ?? {
      turnScore: 0,
      kept: [],
      rolledThisStep: [],
      mustChoose: false,
    };
    const numToRoll = 6 - t.kept.length;
    const roll = rollN(numToRoll);
    const { score: maxScore } = ten10kScoreCombo(roll);

    if (maxScore === 0) {
      commit({
        ...rollMeta(roll, { outcome: "farkle", label: "FARKLE" }, input.byUid),
        ten: { turnScore: 0, kept: [], rolledThisStep: [], mustChoose: false },
        current: nextCurrent(g),
        ...turnStamps(g),
      });
      return;
    }

    commit({
      ...rollMeta(roll, { outcome: "rolled", label: "" }, input.byUid),
      ten: { ...t, rolledThisStep: roll, mustChoose: true },
      ...turnStamps(g),
    });
  });
}
