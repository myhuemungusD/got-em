/**
 * Rich invite modal — ported from `prototypes/gotem.html` (~2528–2575).
 *
 * Shows three ways into a game: a QR to scan, the big room code to read out,
 * and the invite link to send. The QR is an enhancement: if `makeQrSvg`
 * returns null (offline / CDN blocked) the QR block is removed and the modal
 * leans on the code + link.
 */
import "../styles/invite.css";
import { buildInviteUrl, shareRoomLink } from "../invite";
import { makeQrSvg } from "./qr";

const QR_SIZE = 220;

function escHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] ?? c,
  );
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    // clipboard blocked / insecure context — non-fatal.
  }
}

/**
 * Render the invite modal into `backdrop`. Returns a cleanup function that
 * detaches listeners and empties the backdrop.
 */
export function openInviteModal(
  code: string,
  backdrop: HTMLElement,
): () => void {
  const url = buildInviteUrl(code);
  const canShare = typeof navigator.share === "function";

  backdrop.innerHTML = `
    <div class="invite-modal" role="dialog" aria-label="Invite players">
      <h2>Invite <span style="color:var(--orange)">Players</span></h2>
      <p>Get a friend into this game — pick whatever's easiest.</p>

      <div class="invite-qr-wrap" data-ref="qr-wrap">
        <div class="invite-qr-loading">Loading scan code…</div>
      </div>
      <div class="invite-qr-caption" data-ref="qr-caption">Have them scan this with their camera</div>

      <div class="invite-divider"><span>or share the code</span></div>

      <div class="invite-code-box">
        <div class="invite-code-label">Room Code</div>
        <div class="invite-code-value">${escHtml(code)}</div>
      </div>

      <div class="invite-link" data-ref="link">${escHtml(url)}</div>

      <div class="invite-actions">
        ${canShare ? `<button class="btn btn-primary" type="button" data-action="share-link">Share Invite Link</button>` : ``}
        <button class="btn ${canShare ? "btn-secondary" : "btn-primary"}" type="button" data-action="copy-link">Copy Invite Link</button>
        <button class="btn btn-ghost" type="button" data-action="close-modal">Done</button>
      </div>
    </div>
  `;

  const shareBtn = backdrop.querySelector<HTMLButtonElement>(
    '[data-action="share-link"]',
  );
  const copyBtn = backdrop.querySelector<HTMLButtonElement>(
    '[data-action="copy-link"]',
  );
  const closeBtn = backdrop.querySelector<HTMLButtonElement>(
    '[data-action="close-modal"]',
  );

  let closed = false;

  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    shareBtn?.removeEventListener("click", onShare);
    copyBtn?.removeEventListener("click", onCopy);
    closeBtn?.removeEventListener("click", onClose);
    backdrop.innerHTML = "";
  };

  const onShare = (): void => {
    void shareRoomLink(code);
  };
  const onCopy = (): void => {
    void copyToClipboard(url);
  };
  const onClose = (): void => {
    cleanup();
  };

  shareBtn?.addEventListener("click", onShare);
  copyBtn?.addEventListener("click", onCopy);
  closeBtn?.addEventListener("click", onClose);

  // Render the QR asynchronously so the modal shows instantly. If it fails,
  // drop the QR block and lean on the code + link.
  void (async () => {
    const svg = await makeQrSvg(url, QR_SIZE);
    if (closed) return;
    const wrap = backdrop.querySelector<HTMLElement>('[data-ref="qr-wrap"]');
    const caption = backdrop.querySelector<HTMLElement>(
      '[data-ref="qr-caption"]',
    );
    if (!wrap) return;
    if (svg) {
      wrap.innerHTML = svg;
      wrap.classList.add("ready");
    } else {
      wrap.remove();
      caption?.remove();
    }
  })();

  return cleanup;
}
