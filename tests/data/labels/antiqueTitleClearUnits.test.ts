/**
 * The title clearance mirrors two shader numbers: a bigger glyph ray or a wider caption
 * halo would let a selected star's title erase its rays again, so a drift fails here.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANTIQUE_TITLE_CLEAR_UNITS } from '../../../src/data/labels/antiqueTitleClearUnits';

const shader = (name: string) =>
  readFileSync(join(process.cwd(), 'src/services/gpu/shaders/antiqueLook', name), 'utf-8');

describe('ANTIQUE_TITLE_CLEAR_UNITS ↔ glyphs/vertex.wesl + captionHalo.wesl', () => {
  it('clears the largest jittered glyph ray plus the halo reach', () => {
    const glyphs = shader('glyphs/vertex.wesl');
    const radii = /let radii = array<f32, \d+>\(([^)]*)\)/.exec(glyphs);
    const jitter = /\(([0-9.]+) \+ ([0-9.]+) \* hash21Hq\(floor\(centre\) \+ 7\.1\)\)/.exec(glyphs);
    const reach = /const REACH = ([0-9.]+);/.exec(shader('shared/captionHalo.wesl'));
    expect(radii && jitter && reach, 'a shader constant moved').toBeTruthy();
    const maxRay = Math.max(...radii![1]!.split(',').map(Number));
    const swell = Number(jitter![1]) + Number(jitter![2]);
    expect(ANTIQUE_TITLE_CLEAR_UNITS).toBeGreaterThanOrEqual(maxRay * swell + Number(reach![1]));
  });
});
