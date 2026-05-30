/**
 * Auto-derived TEST_MODE flag.
 *
 * Rule: TEST_MODE is true when we are NOT in a real production build that
 * has Firebase config bound. Specifically:
 *   - vitest sets `import.meta.env.MODE === 'test'` → TEST_MODE
 *   - `vite dev` runs in development without committed keys → TEST_MODE
 *   - `vite build` / `vite preview` (prod) → real Firebase
 *
 * This is NOT a manual flag. To switch to real Firebase, build for prod
 * and supply VITE_FIREBASE_* env vars; otherwise the mock backend handles
 * everything in-process so callers (and tests) need no network.
 */

interface ViteEnvLike {
  MODE?: string;
  DEV?: boolean;
  PROD?: boolean;
}

function readEnv(): ViteEnvLike {
  // `import.meta.env` is injected by Vite/Vitest. In a plain Node context
  // (e.g. an ad-hoc script) it may be undefined — fall back to test mode.
  try {
    const env = import.meta.env as ViteEnvLike | undefined;
    return env ?? {};
  } catch {
    return {};
  }
}

const env = readEnv();

/**
 * True when the in-memory mock backend should be used.
 * Derived once at module load — tests and dev both hit the mock.
 */
export const TEST_MODE: boolean =
  env.MODE === "test" || env.DEV === true || env.PROD !== true;
