export type SfxName =
  | "dice-roll"
  | "dice-settle"
  | "tap"
  | "win"
  | "lose"
  | "lock"
  | "bust";

export interface Sfx {
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  play(name: SfxName): void;
}

const STORAGE_KEY = "streetdice.muted";
const MASTER_GAIN = 0.35;

type AudioContextCtor = new () => AudioContext;

interface AudioWindow {
  AudioContext?: AudioContextCtor;
  webkitAudioContext?: AudioContextCtor;
  localStorage?: Storage;
  matchMedia?: (q: string) => MediaQueryList;
}

function getWin(): AudioWindow | null {
  if (typeof window === "undefined") return null;
  return window;
}

function readMuted(): boolean {
  const win = getWin();
  try {
    const raw = win?.localStorage?.getItem(STORAGE_KEY);
    return raw === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  const win = getWin();
  try {
    win?.localStorage?.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // localStorage may be blocked (private mode, quota); silently ignore.
  }
}

function prefersReducedMotion(): boolean {
  const win = getWin();
  try {
    return win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

let ctx: AudioContext | null = null;
let ctxFailed = false;

function getCtx(): AudioContext | null {
  if (ctx || ctxFailed) return ctx;
  const win = getWin();
  if (!win) {
    ctxFailed = true;
    return null;
  }
  const Ctor = win.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) {
    ctxFailed = true;
    return null;
  }
  try {
    ctx = new Ctor();
  } catch {
    ctxFailed = true;
    ctx = null;
  }
  return ctx;
}

function masterGain(ac: AudioContext, scale = 1): GainNode {
  const g = ac.createGain();
  const softness = prefersReducedMotion() ? 0.6 : 1;
  g.gain.value = MASTER_GAIN * scale * softness;
  g.connect(ac.destination);
  return g;
}

function tone(
  ac: AudioContext,
  out: AudioNode,
  type: OscillatorType,
  freq: number,
  startOffset: number,
  duration: number,
  peak = 1,
): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + startOffset;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noiseBuffer(ac: AudioContext, durationSec: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ac.sampleRate * durationSec));
  const buf = ac.createBuffer(1, length, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function playNoiseBurst(
  ac: AudioContext,
  startOffset: number,
  duration: number,
  fStart: number,
  fEnd: number,
  peak: number,
): void {
  const buf = noiseBuffer(ac, duration);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1;
  const t0 = ac.currentTime + startOffset;
  filter.frequency.setValueAtTime(fStart, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, fEnd), t0 + duration);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  const master = masterGain(ac);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

function playDiceRoll(ac: AudioContext): void {
  playNoiseBurst(ac, 0, 0.2, 800, 200, 0.9);
}

function playDiceSettle(ac: AudioContext): void {
  const master = masterGain(ac, 0.8);
  tone(ac, master, "square", 380, 0, 0.04, 0.5);
  tone(ac, master, "square", 240, 0.08, 0.04, 0.5);
}

function playTap(ac: AudioContext): void {
  const master = masterGain(ac, 0.4);
  tone(ac, master, "triangle", 600, 0, 0.06, 0.6);
}

function playWin(ac: AudioContext): void {
  const master = masterGain(ac, 0.9);
  const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
  notes.forEach((f, i) => {
    tone(ac, master, "sine", f, i * 0.12, 0.22, 0.7);
  });
}

function playLose(ac: AudioContext): void {
  const master = masterGain(ac, 0.7);
  tone(ac, master, "triangle", 440, 0, 0.25, 0.6); // A4
  tone(ac, master, "triangle", 349.23, 0.25, 0.3, 0.6); // F4
}

function playLock(ac: AudioContext): void {
  const master = masterGain(ac, 1);
  tone(ac, master, "sine", 80, 0, 0.15, 0.9);
}

function playBust(ac: AudioContext): void {
  playNoiseBurst(ac, 0, 0.08, 600, 120, 0.8);
  playNoiseBurst(ac, 0.1, 0.08, 500, 100, 0.8);
}

const PLAYERS: Record<SfxName, (ac: AudioContext) => void> = {
  "dice-roll": playDiceRoll,
  "dice-settle": playDiceSettle,
  tap: playTap,
  win: playWin,
  lose: playLose,
  lock: playLock,
  bust: playBust,
};

let muted = readMuted();

function resumeIfSuspended(ac: AudioContext): void {
  if (ac.state === "suspended") {
    try {
      void ac.resume();
    } catch {
      // No-op; some browsers throw synchronously on premature resume.
    }
  }
}

const sfx: Sfx = {
  isMuted(): boolean {
    return muted;
  },
  setMuted(next: boolean): void {
    muted = next;
    writeMuted(next);
  },
  play(name: SfxName): void {
    if (muted) return;
    const ac = getCtx();
    if (!ac) return;
    try {
      resumeIfSuspended(ac);
      PLAYERS[name](ac);
    } catch {
      // Audio scheduling failures must never throw into UI handlers.
    }
  },
};

export function getSfx(): Sfx {
  return sfx;
}

export function __resetSfxForTests(): void {
  ctx = null;
  ctxFailed = false;
  muted = readMuted();
}
