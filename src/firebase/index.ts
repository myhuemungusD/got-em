/**
 * Public surface of the firebase layer.
 *
 * Screens import from here only. Nothing else in `src/` should reach into
 * `./mock`, `./config`, or instantiate real Firebase directly.
 */
export {
  createRoom,
  joinRoom,
  startGame,
  advanceTurn,
  leaveGame,
  readGame,
  subscribeGame,
  updateGameTx,
  genCode,
  lockWagers,
  settlePot,
  refundWagers,
} from "./ops";
export type {
  CreateRoomInput,
  JoinRoomInput,
  StartGameInput,
  AdvanceTurnInput,
  LeaveGameInput,
  LockWagersInput,
  SettlePotInput,
  RefundWagersInput,
} from "./ops";

export {
  rollCraps,
  rollClo,
  rollTen,
  bankTen,
  rollAgainTen,
  genId,
} from "./gameplay";
export type { RollInput, TenKeepInput } from "./gameplay";

export { TEST_MODE } from "./mode";
export { firebaseConfig, isFirebaseConfigured } from "./config";
export type { FirebaseConfig } from "./config";

export type {
  GameDoc,
  DocRef,
  DocSnapshot,
  Tx,
  TxFn,
  Unsubscribe,
  OpError,
  // Re-exported game types (from ./types which re-exports from ../state).
  GameMode,
  GameStatus,
  Slot,
  CrapsState,
  MatchupState,
  TenState,
  RollResult,
  GameState,
  WagerPot,
} from "./types";
