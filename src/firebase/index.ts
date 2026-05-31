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
} from "./ops";
export type {
  CreateRoomInput,
  JoinRoomInput,
  StartGameInput,
  AdvanceTurnInput,
  LeaveGameInput,
} from "./ops";

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
} from "./types";
