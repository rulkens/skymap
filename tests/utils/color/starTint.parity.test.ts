import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { starTintFromBpRp } from '../../../src/utils/color/starTintFromBpRp';

const wesl = readFileSync(
  join(process.cwd(), 'src/services/gpu/shaders/lib/starTint.wesl'),
  'utf-8',
);
const anchors = [...wesl.matchAll(/let \w+ = vec3<f32>\(([^)]*)\);/g)].map((m) =>
  m[1]!.split(',').map(Number),
);
// Each segment line reads `saturate((bpRp - lo) / (hi - lo))`; `lo` may sit in parentheses.
const segments = [
  ...wesl.matchAll(/saturate\(\(bpRp\s*-\s*\(?\s*(-?[\d.]+)\s*\)?\s*\)\s*\/\s*\(\s*(-?[\d.]+)/g),
].map((m) => [Number(m[1]), Number(m[2])] as const);
const breakpoints = [segments[0]![0], ...segments.map(([, hi]) => hi)];

it('the CPU star tint lands on the shader ramp at every breakpoint and segment midpoint', () => {
  expect(anchors).toHaveLength(5);
  expect(breakpoints).toHaveLength(5);
  breakpoints.forEach((bp, i) => {
    starTintFromBpRp(bp).forEach((c, k) => expect(c).toBeCloseTo(anchors[i]![k]!, 12));
    if (i === 0) return;
    const mid = starTintFromBpRp((breakpoints[i - 1]! + bp) / 2);
    mid.forEach((c, k) => expect(c).toBeCloseTo((anchors[i - 1]![k]! + anchors[i]![k]!) / 2, 12));
  });
});
