import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ensureAuth, getCodeFromUrl, loadSavedName, __resetAuthForTests } from "./auth";

const UID_KEY = "gotem_uid";
const NAME_KEY = "streetdice.myName";
const UUID_RE = /^[0-9a-f-]{36}$/i;

beforeEach(() => {
  localStorage.clear();
  __resetAuthForTests();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  __resetAuthForTests();
});

describe("ensureAuth (TEST_MODE)", () => {
  it("generates and persists a uuid when storage is empty", async () => {
    expect(localStorage.getItem(UID_KEY)).toBeNull();
    const uid = await ensureAuth();
    expect(uid).toMatch(UUID_RE);
    expect(localStorage.getItem(UID_KEY)).toBe(uid);
  });

  it("returns the same uid across repeated calls (persisted)", async () => {
    const first = await ensureAuth();
    const second = await ensureAuth();
    expect(second).toBe(first);
  });

  it("reuses a uid already stored from a prior session", async () => {
    localStorage.setItem(UID_KEY, "preexisting-uid");
    const uid = await ensureAuth();
    expect(uid).toBe("preexisting-uid");
  });

  it("falls back to a stable in-memory uid when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const first = await ensureAuth();
    expect(first).toMatch(UUID_RE);
    const second = await ensureAuth();
    expect(second).toBe(first);
  });
});

describe("loadSavedName", () => {
  it("returns the stored display name", () => {
    localStorage.setItem(NAME_KEY, "Riley");
    expect(loadSavedName()).toBe("Riley");
  });

  it("returns empty string when nothing is stored", () => {
    expect(loadSavedName()).toBe("");
  });

  it("returns empty string when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadSavedName()).toBe("");
  });
});

describe("getCodeFromUrl", () => {
  it("reads a 4-letter code from the query string", () => {
    expect(getCodeFromUrl("https://x.test/?room=abcd")).toBe("ABCD");
  });

  it("reads a 4-letter code from the hash", () => {
    expect(getCodeFromUrl("https://x.test/#room=WXYZ")).toBe("WXYZ");
  });

  it("returns null when no code is present", () => {
    expect(getCodeFromUrl("https://x.test/")).toBeNull();
  });

  it("ignores codes that are not exactly 4 letters", () => {
    expect(getCodeFromUrl("https://x.test/?room=abc")).toBeNull();
  });
});
