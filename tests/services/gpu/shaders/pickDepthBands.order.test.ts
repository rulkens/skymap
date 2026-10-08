import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(process.cwd(), 'src/services/gpu/shaders/lib/pickDepthBands.wesl'),
  'utf8',
);

const band = (name: string): number => {
  const m = new RegExp(`const ${name}: f32 = ([0-9.e-]+);`).exec(SOURCE);
  expect(m, `${name} missing from pickDepthBands.wesl`).not.toBeNull();
  return Number(m![1]);
};

describe('pickDepthBands.wesl ring band', () => {
  it('a structure ring ranks above both star bands and below the glints', () => {
    const ring = band('PICK_BAND_STRUCTURE_RING_EPS');
    expect(ring).toBeGreaterThan(band('PICK_BAND_SCENE_STAR_EPS'));
    expect(ring).toBeGreaterThan(band('PICK_BAND_SURVEY_STAR_EPS'));
    expect(ring).toBeLessThan(band('PICK_BAND_MOON_EPS'));
  });
});
