/**
 * lib/horizonLookup.wesl restates `horizonTexelOf`'s sector → texel rule, which the bake packs by.
 * A drift reads every post through the wrong sectors: shadows stay plausible, just aimed wrong.
 * The WGSL expression is scraped and evaluated for each sector.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { HORIZON_SECTORS } from '../../../../src/layers/body/surfaceTiles/horizon/data/horizonAngleMap';
import { horizonTexelOf } from '../../../../src/layers/body/surfaceTiles/horizon/utils/horizonTexelOf';

it("horizonSectorTexel's expression equals horizonTexelOf for every sector", () => {
  const source = readFileSync(
    join(process.cwd(), 'src/services/gpu/shaders/lib/horizonLookup.wesl'),
    'utf-8',
  );
  const body = source.match(
    /fn horizonSectorTexel\(sector: u32\) -> vec3<u32> \{\s*return vec3<u32>\((.*)\);\s*\}/,
  )?.[1];
  expect(body).toBeDefined();
  // WGSL's u32 literals and bit operators read the same in JS once the `u` suffix is gone.
  const evaluate = new Function('sector', `return [${body!.replace(/(\d+)u\b/g, '$1')}];`) as (
    sector: number,
  ) => [number, number, number];
  for (let sector = 0; sector < HORIZON_SECTORS; sector++) {
    const { dx, dy, channel } = horizonTexelOf(sector);
    expect(evaluate(sector), `sector ${sector}`).toEqual([dx, dy, channel]);
  }
});
