import type { RedshiftDot } from '../../../@types/RedshiftDot';

export const W = 360;
export const ROW = 96;
export const CENTRE = 214;
const RADIUS = 20;
const STRETCH = 6.5;
// The ring's left edge is the text's.
export const SUN = 5;

// Mulberry32: the dots must be the same on every build, and the same in both rows.
export const dots: readonly RedshiftDot[] = (() => {
  let seed = 20261007;
  const random = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 46 }, () => {
    const r = RADIUS * Math.sqrt(random());
    const angle = 2 * Math.PI * random();
    // The sum of three draws is close enough to the bell curve of velocities in a cluster.
    const velocity = (random() + random() + random()) / 1.5 - 1;
    return { x: r * Math.cos(angle), y: r * Math.sin(angle), shift: velocity * RADIUS * STRETCH };
  });
})();

export const rows = [
  { name: 'In space', y: ROW / 2, at: (dot: RedshiftDot) => dot.x },
  { name: 'In a map made from redshifts', y: ROW * 1.5, at: (dot: RedshiftDot) => dot.x + dot.shift },
];
