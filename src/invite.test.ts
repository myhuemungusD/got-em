import { describe, it, expect, afterEach, vi } from "vitest";
import {
  buildInviteUrl,
  getCodeFromUrl,
  setRoomUrl,
  clearRoomUrl,
  shareRoomLink,
} from "./invite";

describe("buildInviteUrl", () => {
  it("puts the code in BOTH the query and the hash", () => {
    const url = buildInviteUrl("ABCD");
    expect(url).toContain("?room=ABCD");
    expect(url).toContain("#room=ABCD");
    expect(url).toMatch(/\?room=ABCD#room=ABCD$/);
  });

  it("round-trips through getCodeFromUrl", () => {
    expect(getCodeFromUrl(buildInviteUrl("WXYZ"))).toBe("WXYZ");
  });
});

describe("getCodeFromUrl", () => {
  it("reads the code from the query param", () => {
    expect(getCodeFromUrl("https://x.test/?room=ABCD")).toBe("ABCD");
  });

  it("reads the code from the hash", () => {
    expect(getCodeFromUrl("https://x.test/#room=ABCD")).toBe("ABCD");
  });

  it("uppercases mixed-case codes", () => {
    expect(getCodeFromUrl("https://x.test/?room=abcd")).toBe("ABCD");
    expect(getCodeFromUrl("https://x.test/#room=AbCd")).toBe("ABCD");
  });

  it("returns null when no code is present", () => {
    expect(getCodeFromUrl("https://x.test/")).toBeNull();
    expect(getCodeFromUrl("https://x.test/?foo=bar")).toBeNull();
  });

  it("rejects codes that are not exactly 4 chars", () => {
    expect(getCodeFromUrl("https://x.test/?room=ABC")).toBeNull();
    expect(getCodeFromUrl("https://x.test/?room=ABCDE")).toBeNull();
  });

  it("rejects codes with characters outside the CODE_CHARS set", () => {
    // I, O, 0, 1 are excluded from CODE_CHARS.
    expect(getCodeFromUrl("https://x.test/?room=AB0D")).toBeNull();
    expect(getCodeFromUrl("https://x.test/?room=AB1D")).toBeNull();
    expect(getCodeFromUrl("https://x.test/?room=ABI D")).toBeNull();
    expect(getCodeFromUrl("https://x.test/?room=AB-D")).toBeNull();
  });

  it("prefers the query code, falling back to the hash", () => {
    expect(getCodeFromUrl("https://x.test/?room=ABCD#room=WXYZ")).toBe("ABCD");
    expect(getCodeFromUrl("https://x.test/?room=zz#room=WXYZ")).toBe("WXYZ");
  });

  it("returns null for a malformed href", () => {
    expect(getCodeFromUrl("not a url")).toBeNull();
  });
});

describe("setRoomUrl / clearRoomUrl", () => {
  it("does not throw and reflects the code via replaceState", () => {
    const spy = vi.spyOn(history, "replaceState");
    setRoomUrl("ABCD");
    expect(spy).toHaveBeenCalledWith(null, "", "?room=ABCD#room=ABCD");
    spy.mockRestore();
  });

  it("clearRoomUrl strips the code via replaceState", () => {
    const spy = vi.spyOn(history, "replaceState");
    clearRoomUrl();
    expect(spy).toHaveBeenCalledWith(null, "", location.pathname);
    spy.mockRestore();
  });

  it("swallows replaceState failures", () => {
    const spy = vi.spyOn(history, "replaceState").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => setRoomUrl("ABCD")).not.toThrow();
    expect(() => clearRoomUrl()).not.toThrow();
    spy.mockRestore();
  });
});

describe("shareRoomLink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls navigator.share with the invite url when available", async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    await shareRoomLink("ABCD");
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0]![0];
    expect(arg.url).toContain("?room=ABCD#room=ABCD");
    expect(arg.text).toContain("ABCD");
  });

  it("does not throw when the user cancels the share (AbortError)", async () => {
    const abort = new Error("cancelled");
    abort.name = "AbortError";
    const share = vi.fn<(data: ShareData) => Promise<void>>().mockRejectedValue(abort);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });
    await expect(shareRoomLink("ABCD")).resolves.toBeUndefined();
    // Cancel should NOT fall through to clipboard copy.
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard when share fails for a non-cancel reason", async () => {
    const share = vi
      .fn<(data: ShareData) => Promise<void>>()
      .mockRejectedValue(new Error("boom"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });
    await shareRoomLink("ABCD");
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]![0]).toContain("?room=ABCD#room=ABCD");
  });

  it("copies to clipboard when navigator.share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await shareRoomLink("ABCD");
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("never throws when clipboard write rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(shareRoomLink("ABCD")).resolves.toBeUndefined();
  });
});
