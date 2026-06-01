/**
 * Room → state → screen bridge.
 *
 * Subscribes to a `games/{code}` doc, mirrors it into `state.game`, and
 * derives `state.screen` from `status`. This is the typed port of the
 * prototype's `handleStateUpdate` (`prototypes/gotem.html` ~1443–1494).
 *
 * No DOM rendering lives here. A remote roll is animated through an
 * INJECTED `animateRoll` hook so the deciding roll is visible before the
 * screen cuts — the prototype's ordering, preserved exactly.
 */
import { setState, state } from "./state";
import { subscribeGame, settlePot } from "./firebase";
import type { GameDoc, GameState, Slot, Unsubscribe } from "./firebase";

export interface WatchRoomHooks {
  animateRoll?: (values: number[]) => Promise<void>;
}

let activeUnsub: Unsubscribe | null = null;

function screenForStatus(status: GameState["status"]): "lobby" | "play" | "gameover" {
  switch (status) {
    case "waiting":
      return "lobby";
    case "in_progress":
      return "play";
    case "finished":
      return "gameover";
  }
}

function isNewRemoteRoll(doc: GameDoc): boolean {
  return (
    doc.lastRollId !== null &&
    doc.lastRollId !== state.lastSeenRollId &&
    doc.lastRoll !== null &&
    doc.lastRolledBy !== state.myUid
  );
}

async function handleDoc(doc: GameDoc | undefined, hooks: WatchRoomHooks): Promise<void> {
  if (!doc) {
    await leaveRoom();
    return;
  }

  const prev = state.game;

  if (
    isNewRemoteRoll(doc) &&
    !state.isAnimatingRoll &&
    hooks.animateRoll &&
    doc.lastRoll
  ) {
    setState({ lastSeenRollId: doc.lastRollId, isAnimatingRoll: true });
    try {
      await hooks.animateRoll(doc.lastRoll);
    } finally {
      setState({ isAnimatingRoll: false });
    }
  } else if (doc.lastRollId !== null) {
    setState({ lastSeenRollId: doc.lastRollId });
  }

  if (prev && (prev.current !== doc.current || prev.lastRollId !== doc.lastRollId)) {
    setState({ pendingTenSelection: [] });
  }

  const patch: { game: GameState; screen: ReturnType<typeof screenForStatus> } = {
    game: doc,
    screen: screenForStatus(doc.status),
  };

  if (doc.status === "finished") {
    setState({ lastConfig: { mode: doc.mode, numPlayers: doc.slots.length } });
  }

  setState(patch);

  maybeAutoSettle(doc);
}

/**
 * Host-only: when a wagered game finishes with an unsettled pot, fire
 * settlePot exactly once. Idempotent on the server (ALREADY_SETTLED is
 * swallowed) so re-renders / late snapshots can't double-pay.
 */
function maybeAutoSettle(doc: GameDoc): void {
  if (doc.status !== "finished") return;
  if (doc.wager === null || doc.wager.settled) return;
  if (doc.winner === null) return;
  if (state.myUid !== doc.hostUid) return;
  void settlePot({ code: doc.code }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg !== "ALREADY_SETTLED") {
      setState({ lastError: msg });
    }
  });
}

export function watchRoom(code: string, hooks: WatchRoomHooks = {}): () => void {
  if (activeUnsub) {
    activeUnsub();
    activeUnsub = null;
  }

  const unsub = subscribeGame(code, (doc) => {
    handleDoc(doc, hooks).catch((err: unknown) => {
      setState({ lastError: err instanceof Error ? err.message : String(err) });
    });
  });

  activeUnsub = unsub;
  setState({ currentRoom: code });

  return () => {
    unsub();
    if (activeUnsub === unsub) activeUnsub = null;
  };
}

/**
 * Tear down the active room subscription and clear room state WITHOUT
 * navigating. Use when leaving a room for a destination other than splash
 * (e.g. "New Game" → mode-select) so a late update to the old (finished)
 * doc can't route the user back via the still-live subscription.
 */
export function stopWatching(): void {
  if (activeUnsub) {
    activeUnsub();
    activeUnsub = null;
  }
  setState({ game: null, currentRoom: null, lastSeenRollId: null });
}

export function leaveRoom(): Promise<void> {
  stopWatching();
  setState({ screen: "splash" });
  return Promise.resolve();
}

export function isMyTurn(g: GameState | null, myUid: string | null): boolean {
  return g ? g.slots[g.current]?.uid === myUid : false;
}

export function currentSlot(g: GameState | null): Slot | null {
  return g ? g.slots[g.current] ?? null : null;
}
