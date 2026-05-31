import { describe, it, expect, vi } from "vitest";
import { makeQrSvg } from "./qr";

describe("makeQrSvg", () => {
  it("returns null and does not throw when the CDN import is unavailable", async () => {
    // happy-dom has no network and the CDN URL is not a resolvable module, so
    // the dynamic import rejects — makeQrSvg must degrade to null, not throw.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(makeQrSvg("https://example.test/?room=ABCD", 220)).resolves.toBeNull();
    warn.mockRestore();
  });

  it("stays null on repeated calls (failure is cached, still no throw)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(makeQrSvg("anything", 100)).resolves.toBeNull();
    await expect(makeQrSvg("anything-else", 100)).resolves.toBeNull();
    warn.mockRestore();
  });
});
