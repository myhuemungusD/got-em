export function rollDie(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    let value: number;
    do {
      crypto.getRandomValues(buf);
      value = buf[0]!;
    } while (value >= 0xfffffffa);
    return (value % 6) + 1;
  }
  return Math.floor(Math.random() * 6) + 1;
}

export function rollN(n: number): number[] {
  return Array.from({ length: n }, rollDie);
}
