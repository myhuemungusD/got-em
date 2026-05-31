/**
 * Shared helpers for end-to-end play-through specs.
 *
 * These drive full games through the REAL ops + bridge against the in-memory
 * mock backend, with a deterministic die source so every outcome is forced.
 * The `queueDice` seam mirrors `src/firebase/gameplay.test.ts` exactly.
 */
import { createRoom, joinRoom, startGame, readGame } from "../firebase";
import { setDieSource } from "../scoring/dice";
import type { GameDoc, GameMode } from "../firebase";

/**
 * Install a die source that yields `values` in order, consumed one die at a
 * time, then throws if drained. `rollN(n)` pulls `n` values left-to-right.
 */
export function queueDice(...values: number[]): void {
  let i = 0;
  setDieSource(() => {
    if (i >= values.length) throw new Error("die queue exhausted");
    return values[i++]!;
  });
}

/** Read a `games/{code}` doc, asserting it exists (every e2e step expects one). */
export async function get(code: string): Promise<GameDoc> {
  const doc = await readGame(code);
  if (!doc) throw new Error(`game ${code} not found`);
  return doc;
}

/**
 * Build a fully-seated, in-progress game in `mode` with `n` players
 * (default 2). Seats are u1..uN in slots 0..N-1; u1 is host and goes first.
 * Joining the LAST seat would auto-start the room, so we always start via the
 * explicit `startGame` host op for a stable setup.
 */
export async function makeGame(mode: GameMode, n = 2): Promise<string> {
  const names = ["Alice", "Bob", "Cara", "Dave", "Erin", "Finn"];
  const code = await createRoom({
    mode,
    numPlayers: n,
    hostUid: "u1",
    hostName: names[0]!,
  });
  for (let i = 1; i < n; i++) {
    await joinRoom({ code, slotIdx: i, uid: `u${i + 1}`, name: names[i]! });
  }
  await startGame({ code, hostUid: "u1" });
  return code;
}

/** Flush a few microtask turns so bridge snapshot listeners settle. */
export async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
