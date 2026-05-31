/**
 * Real Firestore adapter — the `!TEST_MODE` backend.
 *
 * Ported from `prototypes/gotem.html` (the non-TEST_MODE init at ~1092–1118
 * and the Firestore ops it dynamic-imports at ~969–978). This module wraps
 * the Firebase v12 modular SDK and re-exposes EXACTLY the surface the
 * in-memory `mock` backend exposes — `doc`, `runTransaction`,
 * `serverTimestamp`, `getDoc`, `onSnapshot` — with structurally identical
 * signatures, so `ops.ts` / `gameplay.ts` can route to either backend
 * interchangeably (see `types.ts` for the shared structural contract).
 *
 * LAZY INIT: `initializeApp`/`getFirestore`/`getAuth` are NOT called at
 * module load. They run once, on first use, behind `getDb()` which first
 * runs `validateConfig()`. This means importing this module in TEST_MODE or
 * under vitest does NOT touch the network or require any env vars — the
 * import is inert until a real op is actually invoked.
 *
 * This file is exercised only when `!TEST_MODE`, which the test suite never
 * hits (it cannot, without a live Firebase project). It is therefore
 * covered by typecheck + lint, not by unit tests — expected for this chunk.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  doc as fsDoc,
  getDoc as fsGetDoc,
  onSnapshot as fsOnSnapshot,
  runTransaction as fsRunTransaction,
  serverTimestamp as fsServerTimestamp,
  type Firestore,
  type DocumentReference,
  type DocumentData,
  type Transaction,
  type FieldValue,
} from "firebase/firestore";

import { firebaseConfig, validateConfig } from "./config";
import type {
  DocRef,
  DocSnapshot,
  GameDoc,
  Tx,
  TxFn,
  Unsubscribe,
} from "./types";

/* -------------------------------------------------------------------- */
/* Lazy singletons                                                      */
/* -------------------------------------------------------------------- */

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;

/**
 * Initialize the Firebase app exactly once, after validating that all
 * required `VITE_FIREBASE_*` keys are present. Throws a stable
 * `BAD_CONFIG`-coded error listing the missing keys if not — callers (boot)
 * map this to the setup-error screen rather than crashing cryptically.
 */
function getApp(): FirebaseApp {
  if (app) return app;
  const check = validateConfig();
  if (!check.ok) {
    const e = new Error(
      `[firebase/real] missing config: ${check.missing.join(", ")}`,
    );
    (e as Error & { code?: string }).code = "BAD_CONFIG";
    throw e;
  }
  app = initializeApp(firebaseConfig);
  return app;
}

function getDb(): Firestore {
  if (!db) db = getFirestore(getApp());
  return db;
}

/** Lazily resolve the Auth instance (shares the lazily-initialized app). */
export function getAuthLazy(): Auth {
  if (!auth) auth = getAuth(getApp());
  return auth;
}

/* -------------------------------------------------------------------- */
/* Internal ref mapping                                                 */
/* -------------------------------------------------------------------- */

/**
 * Our public `DocRef` is the structural `{ path }` shape both backends
 * share. Internally we map it to a real Firestore `DocumentReference` by
 * splitting the stored path back into `collection/id`. Paths in this app are
 * always exactly `games/{code}` (one segment + id), matching `doc()` below.
 */
function toRealRef(ref: DocRef): DocumentReference<DocumentData> {
  const [col, ...rest] = ref.path.split("/");
  const id = rest.join("/");
  if (!col || !id) {
    throw new Error(`[firebase/real] invalid doc path: ${ref.path}`);
  }
  return fsDoc(getDb(), col, id);
}

/* -------------------------------------------------------------------- */
/* Public surface (mirror of mock.ts)                                   */
/* -------------------------------------------------------------------- */

/**
 * Mirror of `mock.doc(db, col, id)`. The first arg is ignored (the mock
 * ignores it too); we resolve the live `db` lazily inside `toRealRef`. We
 * return the structural `{ path }` so the rest of the app never holds a
 * live SDK reference — keeping both backends interchangeable.
 */
export function doc(_db: unknown, col: string, id: string): DocRef {
  return { path: `${col}/${id}` };
}

export async function getDoc<T = DocumentData>(
  ref: DocRef,
): Promise<DocSnapshot<T>> {
  const snap = await fsGetDoc(toRealRef(ref));
  return {
    exists: () => snap.exists(),
    data: () => (snap.exists() ? (snap.data() as T) : undefined),
  };
}

export function onSnapshot<T = DocumentData>(
  ref: DocRef,
  onNext: (snap: DocSnapshot<T>) => void,
): Unsubscribe {
  return fsOnSnapshot(toRealRef(ref), (snap) => {
    onNext({
      exists: () => snap.exists(),
      data: () => (snap.exists() ? (snap.data() as T) : undefined),
    });
  });
}

/**
 * `serverTimestamp()` returns the SDK's `FieldValue` sentinel. The mock
 * returns a `number` (Date.now()). Both are valid values for the
 * timestamp/`number | object` doc fields per `GameDoc`, so callers that
 * stash this into `createdAt`/`updatedAt` work against either backend.
 *
 * NOTE: as documented in ops.ts, `turnDeadline` does arithmetic on a
 * timestamp; the real sentinel can't be added, so turn deadlines use
 * `Date.now()` arithmetic in the ops layer, not this sentinel. This is only
 * used where a raw stored timestamp is acceptable.
 */
export function serverTimestamp(): FieldValue {
  return fsServerTimestamp();
}

/**
 * Mirror of `mock.runTransaction`. Adapts the real Firestore `Transaction`
 * to our structural `Tx` interface so reducers written against the mock run
 * unchanged. The real client serializes + retries on conflict for us.
 */
export function runTransaction<R>(_db: unknown, fn: TxFn<R>): Promise<R> {
  return fsRunTransaction(getDb(), (realTx: Transaction) => {
    const tx: Tx = {
      get: async <T = GameDoc>(ref: DocRef): Promise<DocSnapshot<T>> => {
        const snap = await realTx.get(toRealRef(ref));
        return {
          exists: () => snap.exists(),
          data: () => (snap.exists() ? (snap.data() as T) : undefined),
        };
      },
      update: (ref, patch) => {
        realTx.update(toRealRef(ref), patch as DocumentData);
      },
      set: (ref, data) => {
        realTx.set(toRealRef(ref), data as DocumentData);
      },
      delete: (ref) => {
        realTx.delete(toRealRef(ref));
      },
    };
    return fn(tx);
  });
}

/* -------------------------------------------------------------------- */
/* Auth (ported from prototype initFirebase ~1092–1118)                 */
/* -------------------------------------------------------------------- */

/**
 * Anonymous sign-in. Returns the resolved uid. Mirrors the prototype: call
 * `signInAnonymously`, then await `onAuthStateChanged` to be sure we hand
 * back a settled `user.uid`. Firebase persists the anonymous session itself
 * (IndexedDB) — we store nothing extra.
 */
export async function signInAnon(): Promise<string> {
  const a = getAuthLazy();
  const cred = await signInAnonymously(a);
  if (cred.user.uid) return cred.user.uid;
  // Fallback: wait for the first authenticated state. (signInAnonymously
  // already resolves with a user, so this is defensive.)
  return new Promise<string>((resolve, reject) => {
    const unsub = onAuthStateChanged(
      a,
      (user) => {
        if (user) {
          unsub();
          resolve(user.uid);
        }
      },
      (err) => {
        unsub();
        reject(err);
      },
    );
  });
}
