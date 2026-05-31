/**
 * Invite link building + deep-link URL parsing + share/clipboard.
 *
 * Ported from `prototypes/gotem.html`:
 *  - buildInviteUrl          ~2425–2428
 *  - setRoomUrl/clearRoomUrl ~2430–2439
 *  - getCodeFromUrl          ~2442–2448
 *  - shareRoomLink           ~2503–2517
 *
 * The code goes in BOTH the query string and the hash so it survives link
 * unfurlers, redirects, and hash-stripping.
 */

// Mirrors CODE_CHARS in src/firebase/ops.ts — replicated (not imported) since
// that const is module-private there. Keep these two in sync.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function isValidCode(code: string): boolean {
  if (code.length !== 4) return false;
  for (const ch of code) {
    if (!CODE_CHARS.includes(ch)) return false;
  }
  return true;
}

export function buildInviteUrl(code: string): string {
  const base = location.origin + location.pathname;
  return `${base}?room=${code}#room=${code}`;
}

/** Pull a 4-char room code from a URL (query param OR hash). */
export function getCodeFromUrl(href: string = location.href): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const fromQuery = url.searchParams.get("room");
  if (fromQuery !== null) {
    const code = fromQuery.toUpperCase();
    if (isValidCode(code)) return code;
  }

  const hashMatch = url.hash.match(/room=([^&]+)/);
  if (hashMatch && hashMatch[1] !== undefined) {
    const code = decodeURIComponent(hashMatch[1]).toUpperCase();
    if (isValidCode(code)) return code;
  }

  return null;
}

/** Reflect the current room in the address bar (query + hash). No navigation. */
export function setRoomUrl(code: string): void {
  try {
    history.replaceState(null, "", `?room=${code}#room=${code}`);
  } catch {
    // some embedded contexts block replaceState — non-fatal.
  }
}

export function clearRoomUrl(): void {
  try {
    history.replaceState(null, "", location.pathname);
  } catch {
    // ignore
  }
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    // clipboard blocked / insecure context — non-fatal, never throw to caller.
  }
}

/**
 * Share the invite link via the native share sheet when available, otherwise
 * copy it to the clipboard. Never throws (a user cancelling the share sheet
 * surfaces as AbortError, which is swallowed).
 */
export async function shareRoomLink(code: string): Promise<void> {
  const url = buildInviteUrl(code);
  const text = `Join my Street Dice game! Room ${code}`;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Street Dice", text, url });
      return;
    } catch (e) {
      // User cancelled the share sheet — done, do not fall back to copy.
      if (e instanceof Error && e.name === "AbortError") return;
      // Any other share failure falls through to the clipboard path.
    }
  }
  await copyToClipboard(url);
}
