import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getSfx, __resetSfxForTests } from "./sfx";

const STORAGE_KEY = "streetdice.muted";

interface FakeNode {
  connect: ReturnType<typeof vi.fn>;
  start?: ReturnType<typeof vi.fn>;
  stop?: ReturnType<typeof vi.fn>;
  gain?: FakeAudioParam;
  frequency?: FakeAudioParam;
  Q?: FakeAudioParam;
  type?: string;
}

interface FakeAudioParam {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues?: ReturnType<typeof vi.fn>;
}

interface CtorCounts {
  ctxConstructed: number;
  oscillatorCount: number;
  gainCount: number;
  noiseSourceCount: number;
}

function makeParam(): FakeAudioParam {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

function installFakeAudioContext(counts: CtorCounts): void {
  class FakeAudioContext {
    state: "running" | "suspended" = "running";
    currentTime = 0;
    sampleRate = 44100;
    destination: FakeNode = { connect: vi.fn() };
    constructor() {
      counts.ctxConstructed += 1;
    }
    createGain(): FakeNode {
      counts.gainCount += 1;
      return { connect: vi.fn(), gain: makeParam() };
    }
    createOscillator(): FakeNode {
      counts.oscillatorCount += 1;
      return {
        connect: vi.fn().mockReturnThis(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: makeParam(),
        type: "sine",
      };
    }
    createBuffer(): { getChannelData: () => Float32Array } {
      return { getChannelData: () => new Float32Array(64) };
    }
    createBufferSource(): FakeNode {
      counts.noiseSourceCount += 1;
      return {
        connect: vi.fn().mockReturnThis(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    }
    createBiquadFilter(): FakeNode {
      return {
        connect: vi.fn().mockReturnThis(),
        type: "bandpass",
        frequency: makeParam(),
        Q: makeParam(),
      };
    }
    resume(): Promise<void> {
      return Promise.resolve();
    }
  }
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
}

function clearAudioContext(): void {
  delete (globalThis as { AudioContext?: unknown }).AudioContext;
  delete (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext;
}

beforeEach(() => {
  window.localStorage.clear();
  clearAudioContext();
  __resetSfxForTests();
});

afterEach(() => {
  clearAudioContext();
  window.localStorage.clear();
  __resetSfxForTests();
});

describe("sfx mute state", () => {
  it("starts unmuted by default", () => {
    expect(getSfx().isMuted()).toBe(false);
  });

  it("respects mute state across calls — no scheduling when muted", () => {
    const counts: CtorCounts = {
      ctxConstructed: 0,
      oscillatorCount: 0,
      gainCount: 0,
      noiseSourceCount: 0,
    };
    installFakeAudioContext(counts);

    const sfx = getSfx();
    sfx.setMuted(true);
    sfx.play("dice-roll");
    sfx.play("dice-settle");
    sfx.play("tap");

    expect(counts.ctxConstructed).toBe(0);
    expect(counts.oscillatorCount).toBe(0);
    expect(counts.noiseSourceCount).toBe(0);
  });

  it("schedules audio when not muted", () => {
    const counts: CtorCounts = {
      ctxConstructed: 0,
      oscillatorCount: 0,
      gainCount: 0,
      noiseSourceCount: 0,
    };
    installFakeAudioContext(counts);

    const sfx = getSfx();
    expect(sfx.isMuted()).toBe(false);
    sfx.play("tap");

    expect(counts.ctxConstructed).toBe(1);
    expect(counts.oscillatorCount).toBeGreaterThan(0);
  });

  it("persists mute via localStorage", async () => {
    getSfx().setMuted(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");

    vi.resetModules();
    const fresh = await import("./sfx");
    fresh.__resetSfxForTests();
    expect(fresh.getSfx().isMuted()).toBe(true);

    fresh.getSfx().setMuted(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("0");
  });
});

describe("sfx safety", () => {
  it("does not throw when AudioContext is unavailable", () => {
    clearAudioContext();
    __resetSfxForTests();
    const sfx = getSfx();
    expect(() => {
      sfx.play("dice-roll");
      sfx.play("dice-settle");
      sfx.play("tap");
      sfx.play("win");
      sfx.play("lose");
      sfx.play("lock");
      sfx.play("bust");
    }).not.toThrow();
  });

  it("does not throw when AudioContext constructor throws", () => {
    class ThrowingCtx {
      constructor() {
        throw new Error("blocked");
      }
    }
    (globalThis as { AudioContext?: unknown }).AudioContext = ThrowingCtx;
    __resetSfxForTests();

    const sfx = getSfx();
    expect(() => {
      sfx.play("dice-roll");
    }).not.toThrow();
  });

  it("caches AudioContext across plays", () => {
    const counts: CtorCounts = {
      ctxConstructed: 0,
      oscillatorCount: 0,
      gainCount: 0,
      noiseSourceCount: 0,
    };
    installFakeAudioContext(counts);

    const sfx = getSfx();
    sfx.play("tap");
    sfx.play("tap");
    sfx.play("dice-roll");
    expect(counts.ctxConstructed).toBe(1);
  });
});
