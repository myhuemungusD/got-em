import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openInviteModal } from "./invite-modal";

function makeBackdrop(): HTMLElement {
  document.body.innerHTML = "";
  const el = document.createElement("div");
  el.id = "modal-backdrop";
  document.body.appendChild(el);
  return el;
}

// The async QR render awaits a dynamic CDN import that rejects (offline). That
// rejection lands on a macrotask, so poll the DOM until the render settles.
async function waitFor(
  cond: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("openInviteModal", () => {
  it("renders the room code and the invite link", () => {
    const backdrop = makeBackdrop();
    const close = openInviteModal("ABCD", backdrop);
    expect(backdrop.querySelector(".invite-code-value")?.textContent).toBe("ABCD");
    const link = backdrop.querySelector('[data-ref="link"]')?.textContent ?? "";
    expect(link).toContain("?room=ABCD#room=ABCD");
    close();
  });

  it("the copy button writes the invite link to the clipboard", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const backdrop = makeBackdrop();
    const close = openInviteModal("ABCD", backdrop);
    backdrop.querySelector<HTMLButtonElement>('[data-action="copy-link"]')!.click();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]![0]).toContain("?room=ABCD#room=ABCD");
    close();
  });

  it("shows a Share button and wires it to navigator.share when available", () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    const backdrop = makeBackdrop();
    const close = openInviteModal("ABCD", backdrop);
    const shareBtn = backdrop.querySelector<HTMLButtonElement>(
      '[data-action="share-link"]',
    );
    expect(shareBtn).not.toBeNull();
    shareBtn!.click();
    expect(share).toHaveBeenCalledTimes(1);
    close();
  });

  it("omits the Share button when navigator.share is unavailable", () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });
    const backdrop = makeBackdrop();
    const close = openInviteModal("ABCD", backdrop);
    expect(
      backdrop.querySelector('[data-action="share-link"]'),
    ).toBeNull();
    close();
  });

  it("drops the QR block when the QR lib is unavailable (link + code only)", async () => {
    const backdrop = makeBackdrop();
    const close = openInviteModal("ABCD", backdrop);
    // QR starts as a loading placeholder...
    expect(backdrop.querySelector('[data-ref="qr-wrap"]')).not.toBeNull();
    // ...and is removed once makeQrSvg resolves to null offline.
    await waitFor(() => backdrop.querySelector('[data-ref="qr-wrap"]') === null);
    expect(backdrop.querySelector('[data-ref="qr-wrap"]')).toBeNull();
    expect(backdrop.querySelector('[data-ref="qr-caption"]')).toBeNull();
    // The code + link survive.
    expect(backdrop.querySelector(".invite-code-value")?.textContent).toBe("ABCD");
    expect(backdrop.querySelector('[data-ref="link"]')).not.toBeNull();
    close();
  });

  it("cleanup empties the backdrop and detaches the copy listener", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const backdrop = makeBackdrop();
    const copyBtn = (() => {
      const close = openInviteModal("ABCD", backdrop);
      const btn = backdrop.querySelector<HTMLButtonElement>(
        '[data-action="copy-link"]',
      )!;
      close();
      return btn;
    })();
    expect(backdrop.innerHTML).toBe("");
    // Detached button no longer triggers a clipboard write.
    copyBtn.click();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("the Done button closes the modal", () => {
    const backdrop = makeBackdrop();
    openInviteModal("ABCD", backdrop);
    backdrop.querySelector<HTMLButtonElement>('[data-action="close-modal"]')!.click();
    expect(backdrop.innerHTML).toBe("");
  });

  it("does not touch the backdrop after the QR resolves if already closed", async () => {
    const backdrop = makeBackdrop();
    const close = openInviteModal("ABCD", backdrop);
    close();
    await flush();
    expect(backdrop.innerHTML).toBe("");
  });
});
