/**
 * lib/horizonLookup.wesl restates `horizonTexelOf`'s sector → texel rule, which the bake packs by.
 * A drift reads every post through the wrong sectors: shadows stay plausible, just aimed wrong.
 * The WGSL expressions are scraped and evaluated for each sector. Node has no GPU, so the two
 * lookup paths are compared where they differ, in how they pick a sector's texel and channel.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { HORIZON_SECTORS } from '../../../../src/layers/body/surfaceTiles/horizon/data/horizonAngleMap';
import { horizonTexelOf } from '../../../../src/layers/body/surfaceTiles/horizon/utils/horizonTexelOf';

const source = readFileSync(
  join(process.cwd(), 'src/services/gpu/shaders/lib/horizonLookup.wesl'),
  'utf-8',
);

// WGSL's u32 literals and bit operators read the same in JS once the `u` suffix is gone.
const jsOf = (wgsl: string) => wgsl.replace(/(\d+)u\b/g, '$1');

it("horizonSectorTexel's expression equals horizonTexelOf for every sector", () => {
  const body = source.match(
    /fn horizonSectorTexel\(sector: u32\) -> vec3<u32> \{\s*return vec3<u32>\((.*)\);\s*\}/,
  )?.[1];
  expect(body).toBeDefined();
  const evaluate = new Function('sector', `return [${jsOf(body!)}];`) as (
    sector: number,
  ) => [number, number, number];
  for (let sector = 0; sector < HORIZON_SECTORS; sector++) {
    const { dx, dy, channel } = horizonTexelOf(sector);
    expect(evaluate(sector), `sector ${sector}`).toEqual([dx, dy, channel]);
  }
});

it('the sun-only path reads the same angle per sector as the 16-load path, and sky as 1', () => {
  // The 16-load path picks a column of horizonPostAngles' matrix, then the sector's channel; the
  // sun-only path loads the sector's texel and takes the same channel. Decode, blend and the
  // sun's smoothstep are shared code, so the paths agree iff each column holds its own texel.
  const columns = [
    ...source.matchAll(/horizonTexelAngles\(atlas, block, vec2<u32>\((\d)u, (\d)u\)\)/g),
  ].map((m) => [Number(m[1]), Number(m[2])] as const);
  expect(columns).toHaveLength(4);
  const columnExpr = source.match(/return angles\[(.+?)\]\[texel\.z\];/)?.[1];
  expect(columnExpr).toBeDefined();
  const columnOf = new Function('texel', `return ${jsOf(columnExpr!)};`) as (texel: {
    x: number;
    y: number;
  }) => number;
  for (const end of ['lower', 'upper']) {
    expect(source).toContain(`horizonTexelAngles(atlas, block, ${end}.xy)[${end}.z]`);
  }
  for (let sector = 0; sector < HORIZON_SECTORS; sector++) {
    const { dx: x, dy: y } = horizonTexelOf(sector);
    expect(columns[columnOf({ x, y })], `sector ${sector}`).toEqual([x, y]);
  }
  expect(source).toMatch(/return vec2<f32>\(sun, select\(1\.0, sky, HORIZON_SKY\)\);/);
});
