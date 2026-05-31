import type { CrapsPhase } from "./scoring/craps";

export type GameMode = "craps" | "clo" | "s456" | "ten";

export type Screen =
  | "boot"
  | "setup-error"
  | "splash"
  | "mode-select"
  | "lobby"
  | "play"
  | "gameover";

export type GameStatus = "waiting" | "in_progress" | "finished";

export interface Slot {
  uid: string | null;
  name: string;
  score: number;
  onBoard: boolean;
  chips: number; // remaining virtual stack
}

export interface WagerPot {
  amount: number; // per-player buy-in, locked at game start
  contributions: Record<string, number>; // uid -> chips committed
  total: number; // sum of contributions
  settled: boolean;
  paidTo: string | null; // winner uid after settle
}

export interface CrapsState {
  phase: CrapsPhase;
  point: number | null;
}

export interface MatchupState {
  rolls: Record<string, number[]>;
}

export interface TenState {
  turnScore: number;
  kept: number[];
  rolledThisStep: number[];
  mustChoose: boolean;
}

export interface RollResult {
  outcome: string;
  label?: string;
  sum?: number;
  point?: number;
  rank?: number | null;
  score?: number;
  used?: boolean[];
}

export interface GameState {
  v: number;
  code: string;
  mode: GameMode;
  hostUid: string;
  numSlots: number;
  slots: Slot[];
  playerUids: string[];
  current: number;
  status: GameStatus;
  winner: string | null;
  lastRoll: number[] | null;
  lastResult: RollResult | null;
  lastRollId: string | null;
  lastRolledBy: string | null;
  /** ms epoch the current turn started; `null` unless `status === "in_progress"`. */
  turnStartedAt: number | null;
  /** ms epoch by which the current player must act; `null` unless `status === "in_progress"`. */
  turnDeadline: number | null;
  /** Per-game turn budget in ms. Defaults to 30000. */
  turnDurationMs: number;
  wager: WagerPot | null; // null = no-wager game (backwards-compat)
  craps?: CrapsState;
  matchup?: MatchupState;
  ten?: TenState;
}

export interface LastConfig {
  mode: GameMode;
  numPlayers: number;
}

export interface AppState {
  screen: Screen;
  myUid: string | null;
  myName: string;
  currentRoom: string | null;
  game: GameState | null;
  selectedMode: GameMode;
  selectedPlayerCount: number;
  proposedWager: number; // host's lobby input; default 0
  selectedStartingChips: number; // default 100
  lastError: string | null;
  /** Last roll id we've already mirrored, so remote rolls animate exactly once. */
  lastSeenRollId: string | null;
  /** True while a remote roll animation is playing; the screen cut waits on it. */
  isAnimatingRoll: boolean;
  /** 10,000-mode local die selection; reset when the turn or roll changes. */
  pendingTenSelection: number[];
  /** Mode + player count of the last finished game, for the rematch shortcut. */
  lastConfig: LastConfig | null;
}

const initialState: AppState = {
  screen: "boot",
  myUid: null,
  myName: "",
  currentRoom: null,
  game: null,
  selectedMode: "craps",
  selectedPlayerCount: 2,
  proposedWager: 0,
  selectedStartingChips: 100,
  lastError: null,
  lastSeenRollId: null,
  isAnimatingRoll: false,
  pendingTenSelection: [],
  lastConfig: null,
};

export const state: AppState = { ...initialState };

type Subscriber = (state: AppState) => void;
const subscribers = new Set<Subscriber>();

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function setState(patch: Partial<AppState>): void {
  Object.assign(state, patch);
  for (const fn of subscribers) fn(state);
}

export function resetState(): void {
  Object.assign(state, initialState);
  subscribers.clear();
}
