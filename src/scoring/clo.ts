export type CloResult =
  | { outcome: "win"; label: string; rank: number }
  | { outcome: "loss"; label: string; rank: number }
  | { outcome: "point"; point: number; label: string; rank: number }
  | { outcome: "reroll"; label: string; rank: null };

export function cloResolve(roll: readonly number[]): CloResult {
  const sorted = [...roll].sort((a, b) => a - b);
  const s = sorted.join("");
  if (s === "456") return { outcome: "win", label: "4-5-6", rank: 1000 };
  if (s === "123") return { outcome: "loss", label: "1-2-3 OUT", rank: -1000 };
  if (sorted[0] === sorted[1] && sorted[1] === sorted[2]) {
    return { outcome: "win", label: `TRIPLE ${sorted[0]}s`, rank: 100 + sorted[0] };
  }
  if (sorted[0] === sorted[1]) {
    return { outcome: "point", point: sorted[2], label: `POINT ${sorted[2]}`, rank: sorted[2] };
  }
  if (sorted[1] === sorted[2]) {
    return { outcome: "point", point: sorted[0], label: `POINT ${sorted[0]}`, rank: sorted[0] };
  }
  if (sorted[0] === sorted[2]) {
    return { outcome: "point", point: sorted[1], label: `POINT ${sorted[1]}`, rank: sorted[1] };
  }
  return { outcome: "reroll", label: "RE-ROLL", rank: null };
}
