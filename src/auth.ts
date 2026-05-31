/**
 * Identity ownership. Establishes the stable per-device uid the rest of the
 * app (joinRoom, slot ownership, turn checks) relies on. Owned centrally here
 * and set on `state.myUid` by boot — leaf screens never mint their own uid.
 *
 * Mirrors the prototype boot flow (`prototypes/gotem.html` ~1092–1118): in a
 * real build this is where `signInAnonymously` resolves a Firebase uid. That
 * wiring lands in a separate chunk together with `firestore.rules`; the prod
 * branch here throws `NOT_IMPLEMENTED` (same pattern as `firebase/ops.ts`)
 * so TEST_MODE is fully usable and the real path is clearly stubbed.
 */
import { TEST_MODE } from "./firebase/mode";

const UID_KEY = "gotem_uid";
const NAME_KEY = "streetdice.myName";

let memoryUid: string | null = null;

function notImpl(name: string): never {
  const e = new Error(
    `[auth] ${name} not implemented in TEST_MODE=false build yet`,
  );
  (e as Error & { code?: string }).code = "NOT_IMPLEMENTED";
  throw e;
}

function readStoredUid(): string | null {
  try {
    return localStorage.getItem(UID_KEY);
  } catch {
    return null;
  }
}

function persistUid(uid: string): void {
  try {
    localStorage.setItem(UID_KEY, uid);
  } catch {
    // Storage unavailable (private mode, blocked). Fall back to an in-memory
    // uid that stays stable for the lifetime of this page session.
    memoryUid = uid;
  }
}

/**
 * Resolve a stable uid for this device.
 *
 * TEST_MODE: read `gotem_uid` from localStorage, generating + persisting a
 * `crypto.randomUUID()` once if absent. Stable across calls and reloads.
 * Guards localStorage access so a throwing storage falls back to a session
 * in-memory uid.
 */
export function ensureAuth(): Promise<string> {
  if (!TEST_MODE) notImpl("ensureAuth");

  if (memoryUid) return Promise.resolve(memoryUid);

  const stored = readStoredUid();
  if (stored) return Promise.resolve(stored);

  const uid = crypto.randomUUID();
  persistUid(uid);
  return Promise.resolve(uid);
}

/** Test-only: clear the in-memory fallback uid between cases. */
export function __resetAuthForTests(): void {
  memoryUid = null;
}

/** Restore a previously saved display name, or "" if none/unavailable. */
export function loadSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

// Deep-link parsing lives in invite.ts (the single source of truth, with
// charset validation matching real room codes). Re-exported here so boot and
// auth callers have one import surface.
export { getCodeFromUrl } from "./invite";
