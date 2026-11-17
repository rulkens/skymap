/**
 * An SVG path that fills a stroke along `curve` whose width follows `width(t)`, round at the start, so a
 * filament can thin along its length, which an SVG stroke cannot.
 */
export function taperPath(
  curve: (t: number) => readonly [number, number],
  width: (t: number) => number,
  steps = 80,
): string {
  const n = (v: number) => Number(v.toFixed(2));
  const left: (readonly [number, number])[] = [];
  const right: (readonly [number, number])[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = curve(Math.max(0, t - 1e-3));
    const b = curve(Math.min(1, t + 1e-3));
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    const [x, y] = curve(t);
    const h = width(t) / 2;
    left.push([x + nx * h, y + ny * h]);
    right.push([x - nx * h, y - ny * h]);
  }
  const cap = n(width(0) / 2);
  const outline = [...left, ...right.reverse()].map(([x, y]) => `${n(x)} ${n(y)}`).join(' L');
  return `M${outline} A ${cap} ${cap} 0 0 1 ${n(left[0]![0])} ${n(left[0]![1])} Z`;
}
