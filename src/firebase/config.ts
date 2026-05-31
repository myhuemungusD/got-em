/**
 * Firebase config — read from Vite env vars (`VITE_FIREBASE_*`).
 *
 * Real keys are NEVER committed. Set them in a local `.env` file
 * (gitignored) or via your hosting provider's env config. See
 * `.env.example` at repo root for the required variable names.
 *
 * In TEST_MODE the values are unused — the mock backend ignores config
 * entirely. Calling `isFirebaseConfigured()` lets the UI render a
 * "setup-error" screen if a prod build is missing keys.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

interface ViteEnvLike {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
}

function readEnv(): ViteEnvLike {
  try {
    const env = import.meta.env as ViteEnvLike | undefined;
    return env ?? {};
  } catch {
    return {};
  }
}

const env = readEnv();

export const firebaseConfig: FirebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: env.VITE_FIREBASE_APP_ID ?? "",
};

/** True when the minimum keys needed to talk to Firebase are present. */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
  );
}

/**
 * Every `VITE_FIREBASE_*` key required to initialize the real Firebase app.
 * All six are required for a real deploy — unlike `isFirebaseConfigured()`
 * (a cheap minimum-keys yes/no), `validateConfig()` reports EXACTLY which
 * keys are missing so a misconfigured prod build can route to the
 * setup-error screen with a precise diagnostic instead of crashing
 * cryptically deep inside the SDK.
 */
const REQUIRED_KEYS: readonly (keyof FirebaseConfig)[] = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

/**
 * Runtime validator used at real-mode startup. Returns `{ ok: true }` when
 * every required key is present and non-empty, otherwise
 * `{ ok: false, missing: [...] }` listing the empty/absent keys (in the
 * canonical order above). Pure — does not initialize Firebase.
 */
export function validateConfig():
  | { ok: true }
  | { ok: false; missing: string[] } {
  const missing = REQUIRED_KEYS.filter(
    (k) => !firebaseConfig[k] || firebaseConfig[k].trim() === "",
  );
  if (missing.length === 0) return { ok: true };
  return { ok: false, missing };
}
