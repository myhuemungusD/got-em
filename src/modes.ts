import type { GameMode } from "./state";

export interface ModeMeta {
  id: GameMode;
  name: string;
  short: string;
  dice: number;
  target: string;
  tagline: string;
}

export const MODES: readonly ModeMeta[] = [
  { id: "craps", name: "Craps", short: "CRAPS", dice: 2, target: "3", tagline: "First to 3 wins" },
  { id: "clo", name: "C-Lo", short: "C-LO", dice: 3, target: "—", tagline: "Highest combo wins" },
  { id: "s456", name: "4-5-6", short: "4-5-6", dice: 3, target: "—", tagline: "Roll 4-5-6 instantly" },
  { id: "ten", name: "10,000", short: "10K", dice: 6, target: "10000", tagline: "Race to 10,000" },
] as const;

export function modeMeta(id: GameMode): ModeMeta {
  const found = MODES.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown game mode: ${id}`);
  return found;
}
