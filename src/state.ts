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
  lastConfig: LastConfig | null;
  pendingTen10kSelection: number[];
  lastSeenRollId: string | null;
  isAnimatingRoll: boolean;
}

const initialState: AppState = {
  screen: "boot",
  myUid: null,
  myName: "",
  currentRoom: null,
  game: null,
  selectedMode: "craps",
  selectedPlayerCount: 2,
  lastConfig: null,
  pendingTen10kSelection: [],
  lastSeenRollId: null,
  isAnimatingRoll: false,
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
