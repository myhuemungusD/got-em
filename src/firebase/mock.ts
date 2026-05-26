/**
 * In-memory Firestore mock — TEST_MODE backend.
 *
 * Ported from `prototypes/gotem.html` (the `if(TEST_MODE)` block around
 * lines 980–1055). Same surface, but:
 *   - typed for strict TS,
 *   - transactions are serialized through a simple mutex so concurrent
 *     `runTransaction` calls behave like the real client (one at a time,
 *     last write wins),
 *   - the store is exposed for tests via `__resetMock()` and
 *     `__getMockStore()` so we can inspect/clear between cases.
 *
 * No I/O. No timers. Deterministic.
 */
import type {
  DocRef,
  DocSnapshot,
  GameDoc,
  Tx,
  TxFn,
  Unsubscribe,
} from "./types";

type AnyData = Record<string, unknown>;
type Listener = (snap: DocSnapshot<AnyData>) => void;

const store = new Map<string, AnyData>();
const listeners = new Map<string, Set<Listener>>();

/** Deep-clone via structuredClone — keeps the mock honest about by-value semantics. */
function clone<T>(v: T): T {
  return structuredClone(v);
}

function snapOf<T>(path: string): DocSnapshot<T> {
  const data = store.get(path);
  return {
    exists: () => data !== undefined,
    data: () => (data === undefined ? undefined : (clone(data) as T)),
  };
}

function notify(path: string): void {
  const cbs = listeners.get(path);
  if (!cbs) return;
  const snap = snapOf<AnyData>(path);
  for (const cb of cbs) {
    try {
      cb(snap);
    } catch (e) {
      // Listener errors should not break other listeners.
      // eslint-disable-next-line no-console
      console.error("[mock] listener threw", e);
    }
  }
}

/* ---------- public ref + doc-level ops (mirror of prototype) ---------- */

export function doc(_db: unknown, col: string, id: string): DocRef {
  return { path: `${col}/${id}` };
}

export async function setDoc<T extends AnyData>(
  ref: DocRef,
  data: T,
): Promise<void> {
  store.set(ref.path, clone(data));
  notify(ref.path);
}

export async function getDoc<T = AnyData>(
  ref: DocRef,
): Promise<DocSnapshot<T>> {
  return snapOf<T>(ref.path);
}

export async function updateDoc(
  ref: DocRef,
  patch: AnyData,
): Promise<void> {
  const cur = store.get(ref.path) ?? {};
  store.set(ref.path, { ...clone(cur), ...clone(patch) });
  notify(ref.path);
}

export function onSnapshot<T = AnyData>(
  ref: DocRef,
  onNext: (snap: DocSnapshot<T>) => void,
): Unsubscribe {
  let set = listeners.get(ref.path);
  if (!set) {
    set = new Set();
    listeners.set(ref.path, set);
  }
  set.add(onNext as Listener);
  // Fire current value immediately, like the real client.
  onNext(snapOf<T>(ref.path));
  return () => {
    listeners.get(ref.path)?.delete(onNext as Listener);
  };
}

export function serverTimestamp(): number {
  return Date.now();
}

/* ---------- transactions ----------
 *
 * The real Firebase client serializes concurrent transactions on the same
 * document(s) and retries on conflict. We don't model retry — we just hold
 * a process-wide lock so two `runTransaction` callers can't interleave
 * their reads and writes. That matches the invariant callers actually
 * rely on (a tx sees a consistent snapshot, and a later tx sees the
 * earlier tx's writes).
 */

let txChain: Promise<unknown> = Promise.resolve();

export function runTransaction<R>(_db: unknown, fn: TxFn<R>): Promise<R> {
  const next = txChain.then(async () => {
    const tx: Tx = {
      get: async <T = GameDoc>(ref: DocRef): Promise<DocSnapshot<T>> =>
        snapOf<T>(ref.path),
      update: (ref, patch) => {
        const cur = store.get(ref.path) ?? {};
        store.set(ref.path, {
          ...clone(cur),
          ...clone(patch as AnyData),
        });
        notify(ref.path);
      },
      set: (ref, data) => {
        store.set(ref.path, clone(data as unknown as AnyData));
        notify(ref.path);
      },
      delete: (ref) => {
        store.delete(ref.path);
        notify(ref.path);
      },
    };
    return fn(tx);
  });
  // Keep the chain alive even if this tx throws, so a failure doesn't
  // wedge subsequent transactions.
  txChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next as Promise<R>;
}

/* ---------- test helpers (NOT exported from index) ---------- */

export function __resetMock(): void {
  store.clear();
  listeners.clear();
  txChain = Promise.resolve();
}

export function __getMockStore(): Map<string, AnyData> {
  return store;
}

export function __getMockListenerCount(path: string): number {
  return listeners.get(path)?.size ?? 0;
}
