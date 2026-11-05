/**
 * A superellipse (|x|^n + |y|^n = 1, n = 5) filling the square at (x0, y0): close to Apple's
 * continuous-corner icon tile, which an `rx` rounded rect visibly is not at 1024 px.
 */
export function squirclePath(x0: number, y0: number, size: number, n = 5, steps = 360): string {
  const r = size / 2;
  const f = (v: number) => Number(v.toFixed(2));
  const points: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const [c, s] = [Math.cos(t), Math.sin(t)];
    const x = x0 + r + r * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = y0 + r + r * Math.sign(s) * Math.abs(s) ** (2 / n);
    points.push(`${f(x)} ${f(y)}`);
  }
  return `M${points.join(' L')} Z`;
}
