/**
 * Wire-format types for Firestore game documents and the minimal Firestore
 * surface this app touches. The game-doc shape is re-exported from
 * `src/state.ts` so callers always agree on what `games/{code}` looks like.
 *
 * The transaction / snapshot / unsubscribe shapes here are intentionally
 * structural — they match the bits of the Firebase v10/v12 modular API we
 * actually use (`tx.get/update/set/delete`, `snap.exists()/data()`) so the
 * in-memory mock and the real client can satisfy the same contract.
 */
export type {
  GameMode,
  GameStatus,
  Slot,
  CrapsState,
  MatchupState,
  TenState,
  RollResult,
  GameState,
} from "../state";

import type { GameState } from "../state";

/** A Firestore document reference. The mock and real client both expose `.path`. */
export interface DocRef {
  readonly path: string;
}

/** A read snapshot of a single document — matches Firestore's modular API. */
export interface DocSnapshot<T> {
  exists(): boolean;
  data(): T | undefined;
}

/** The subset of `Transaction` methods we use. */
export interface Tx {
  get<T = GameDoc>(ref: DocRef): Promise<DocSnapshot<T>>;
  update(ref: DocRef, patch: Partial<GameDoc> & Record<string, unknown>): void;
  set(ref: DocRef, data: GameDoc): void;
  delete(ref: DocRef): void;
}

export type TxFn<R> = (tx: Tx) => Promise<R>;
export type Unsubscribe = () => void;

/**
 * The on-disk shape of `games/{code}`. Extends `GameState` (the in-memory
 * shape from `state.ts`) with server-managed timestamps. We keep these
 * loose (`number | object`) because `serverTimestamp()` returns a sentinel
 * on the real client but a number in the mock.
 */
export interface GameDoc extends GameState {
  createdAt: number | object;
  updatedAt: number | object;
}

/** Errors thrown by the ops layer. Stable strings so the UI can map them. */
export type OpError =
  | "ROOM_NOT_FOUND"
  | "GAME_OVER"
  | "ALREADY_STARTED"
  | "BAD_SLOT"
  | "SLOT_TAKEN"
  | "NOT_HOST"
  | "TOO_FEW_PLAYERS"
  | "NOT_IN_PROGRESS"
  | "NOT_YOUR_TURN"
  | "CODE_GEN_FAILED"
  | "NOT_IMPLEMENTED";
