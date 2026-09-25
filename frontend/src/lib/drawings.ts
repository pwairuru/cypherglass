const PREFIX = "cg-drawings:";
const VERSION = 1;
export function keyFor(chartKey: string): string { return `${PREFIX}${chartKey}:v${VERSION}`; }
export function saveDrawings(chartKey: string, state: unknown): void {
  try {
    localStorage.setItem(keyFor(chartKey), JSON.stringify({ version: VERSION, state }));
  } catch {
    // Swallow QuotaExceededError / private-mode DOMExceptions: drawings are
    // best-effort local persistence; the chart must keep working.
  }
}
export function loadDrawings(chartKey: string): unknown | null {
  const raw = localStorage.getItem(keyFor(chartKey));
  if (!raw) return null;
  try { return (JSON.parse(raw) as { state: unknown }).state; }
  catch { return null; }
}
export function exportDrawings(chartKey: string): string { return localStorage.getItem(keyFor(chartKey)) ?? ""; }
export function importDrawings(chartKey: string, json: string): void {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error("bad drawings json"); }
  if (typeof parsed !== "object" || parsed === null || !("state" in parsed)) throw new Error("bad drawings json");
  localStorage.setItem(keyFor(chartKey), JSON.stringify(parsed));
}
