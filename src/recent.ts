import type { GameState, GameMode } from "./state";

const ROOMS_KEY = "streetdice.recentRooms";
const CHALLENGERS_KEY = "streetdice.recentChallengers";
const TTL_MS = 3 * 24 * 60 * 60 * 1000;
const ROOMS_CAP = 5;
const CHALLENGERS_CAP = 8;

const MODES: readonly GameMode[] = ["craps", "clo", "s456", "ten"];

interface RoomEntry {
  code: string;
  ts: number;
}

export interface Challenger {
  name: string;
  mode: GameMode;
  ts: number;
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / disabled / private mode — non-fatal */
  }
}

function isMode(value: unknown): value is GameMode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

function readRoomEntries(): RoomEntry[] {
  const raw = read(ROOMS_KEY);
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const out: RoomEntry[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const code = rec["code"];
    const ts = rec["ts"];
    if (typeof code !== "string" || typeof ts !== "number") continue;
    if (now - ts >= TTL_MS) continue;
    out.push({ code, ts });
  }
  out.sort((a, b) => b.ts - a.ts);
  return out;
}

export function rememberRoom(code: string): void {
  if (!code) return;
  const entries = readRoomEntries().filter((e) => e.code !== code);
  entries.unshift({ code, ts: Date.now() });
  write(ROOMS_KEY, entries.slice(0, ROOMS_CAP));
}

export function getRecentRooms(): string[] {
  const entries = readRoomEntries();
  write(ROOMS_KEY, entries);
  return entries.map((e) => e.code);
}

export function forgetRoom(code: string): void {
  const entries = readRoomEntries().filter((e) => e.code !== code);
  write(ROOMS_KEY, entries);
}

function readChallengers(): Challenger[] {
  const raw = read(CHALLENGERS_KEY);
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const out: Challenger[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const name = rec["name"];
    const ts = rec["ts"];
    const mode = rec["mode"];
    if (typeof name !== "string" || typeof ts !== "number" || !isMode(mode)) continue;
    if (now - ts >= TTL_MS) continue;
    out.push({ name, mode, ts });
  }
  out.sort((a, b) => b.ts - a.ts);
  return out;
}

function dedupeByName(list: Challenger[]): Challenger[] {
  const seen = new Set<string>();
  const merged: Challenger[] = [];
  for (const c of list) {
    const key = c.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(c);
  }
  return merged;
}

export function rememberChallengers(g: GameState, myUid: string): void {
  if (!Array.isArray(g.slots)) return;
  const now = Date.now();
  const opponents: Challenger[] = g.slots
    .filter((s) => s.uid && s.uid !== myUid && s.name.trim().length > 0)
    .map((s) => ({ name: s.name.trim(), mode: g.mode, ts: now }));
  if (opponents.length === 0) return;
  const merged = dedupeByName([...opponents, ...readChallengers()]);
  write(CHALLENGERS_KEY, merged.slice(0, CHALLENGERS_CAP));
}

export function getRecentChallengers(): Challenger[] {
  const fresh = dedupeByName(readChallengers());
  write(CHALLENGERS_KEY, fresh);
  return fresh;
}

export function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
