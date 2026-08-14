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
import { maybeNpcTurn, clearNpcs } from "./npc";
import { humanError } from "./utils/human-error";

export interface WatchRoomHooks {
  animateRoll?: (values: number[]) => Promise<void>;
}

let activeUnsub: Unsubscribe | null = null;
let activeCode: string | null = null;

/**
 * Snapshot serialization. `handleDoc` awaits the roll animation (~2s) and
 * more snapshots arrive during it. Without serialization the newer doc was
 * applied first and then OVERWRITTEN by the older invocation resuming —
 * reverting the board, and in the worst case routing back to `play` from a
 * finished game that will never write again.
 *
 * Only the newest pending doc is kept: a snapshot superseded during an
 * animation is stale by definition, and applying the intermediate states
 * would just replay them at the wrong time.
 */
let handlingDoc = false;
let queuedDoc: GameDoc | undefined;
let hasQueuedDoc = false;

/**
 * Bumped whenever the watched room changes or is torn down. Guards both the
 * queued doc and the in-flight one (which re-checks after its await), so a
 * late update to the room we just left can't re-route the player back in.
 */
let watchGen = 0;

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

/**
 * Runs `handleDoc` one at a time. Starts synchronously when idle, so the
 * common no-animation path applies state in the same tick the snapshot
 * arrives — the ordering the screens and their tests rely on.
 */
function dispatchDoc(doc: GameDoc | undefined, hooks: WatchRoomHooks, gen: number): void {
  if (gen !== watchGen) return;
  if (handlingDoc) {
    queuedDoc = doc;
    hasQueuedDoc = true;
    return;
  }
  handlingDoc = true;
  void handleDoc(doc, hooks, gen)
    .catch((err: unknown) => {
      setState({ lastError: err instanceof Error ? err.message : String(err) });
    })
    .finally(() => {
      handlingDoc = false;
      if (hasQueuedDoc) {
        const next = queuedDoc;
        queuedDoc = undefined;
        hasQueuedDoc = false;
        dispatchDoc(next, hooks, gen);
      }
    });
}

async function handleDoc(
  doc: GameDoc | undefined,
  hooks: WatchRoomHooks,
  gen: number,
): Promise<void> {
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
    // We suspended for the length of the animation. If the room was left or
    // swapped meanwhile, this doc is stale — applying it would drag the
    // player back into a room they are no longer watching.
    if (gen !== watchGen) return;
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
  if (state.myUid === doc.hostUid) maybeNpcTurn(doc);
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
  void settlePot({ code: doc.code, hostUid: doc.hostUid }).catch((err: unknown) => {
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
  // Screens re-run watchRoom on mount (lobby → play → gameover) to swap
  // hooks. Only forget our NPCs when actually changing rooms — clearing on
  // every re-watch orphaned the CPU the moment the play screen mounted,
  // leaving it to stall out the 30s turn timer every round.
  if (activeCode !== code) clearNpcs();
  activeCode = code;
  const gen = ++watchGen;

  const unsub = subscribeGame(
    code,
    (doc) => {
      dispatchDoc(doc, hooks, gen);
    },
    (err) => {
      // Firestore kills an errored listener permanently — without this the
      // table silently freezes. Route to the recoverable error screen; the
      // player can reload and rejoin via Recent Rooms.
      setState({ lastError: humanError(err), screen: "setup-error" });
    },
  );

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
  activeCode = null;
  watchGen++;
  clearNpcs();
  setState({ game: null, currentRoom: null, lastSeenRollId: null });
}

export function leaveRoom(): Promise<void> {
  stopWatching();
  setState({ screen: "splash" });
  return Promise.resolve();
}

export function isMyTurn(g: GameState | null, myUid: string | null): boolean {
  return !!myUid && g != null && g.slots[g.current]?.uid === myUid;
}

export function currentSlot(g: GameState | null): Slot | null {
  return g ? g.slots[g.current] ?? null : null;
}
