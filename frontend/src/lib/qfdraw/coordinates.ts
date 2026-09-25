// frontend/src/lib/qfdraw/coordinates.ts
export function timeToIndex(times:number[], t:number): number {
  if (times.length === 0) return 0;
  let best = 0, bd = Math.abs(times[0] - t);
  for (let i = 1; i < times.length; i++) { const d = Math.abs(times[i] - t); if (d < bd) { bd = d; best = i; } }
  return best;
}
