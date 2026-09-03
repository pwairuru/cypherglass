/** Read a space-syntax HSL var (e.g. "217 91% 60%") and return comma-syntax
 *  `hsl(217, 91%, 60%)`. ECharts/zrender strips whitespace before parsing,
 *  so space-syntax colors corrupt on hover emphasis (series goes invisible).
 */
export function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!v) return fallback;
  if (v.includes(",")) return `hsl(${v})`;
  return `hsl(${v.split(/\s+/).join(", ")})`;
}
