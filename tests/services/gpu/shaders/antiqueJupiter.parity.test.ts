/**
 * Jupiter's Red Spot is washed in rose madder by its row in `pigments.wesl`'s table:
 * an index, not a name, so a pigment added or reordered there would silently wash the
 * spot in another colour (it moved once, in a15afdc0f).
 */
import { describe, expect, it } from 'vitest';

import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';

const JUPITER = readShaderSource('src/services/gpu/shaders/antiqueLook/bodies/jupiter.wesl');
const PIGMENTS = readShaderSource('src/services/gpu/shaders/antiqueLook/shared/pigments.wesl');

describe('Jupiter print', () => {
  it("washes the spot in the pigment table's rose madder", () => {
    const table = PIGMENTS.match(/const PIGMENTS[^=]*= array<[^(]*\(([\s\S]*?)\n\);/)?.[1] ?? '';
    const rows = table.split('\n').filter((line) => line.includes('vec3<f32>('));
    const index = Number(JUPITER.match(/const ROSE_MADDER: f32 = ([0-9.]+);/)?.[1]);
    expect(rows[index]).toMatch(/\/\/ rose madder/);
  });
});
