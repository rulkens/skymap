/**
 * A shape model is imported with identity axes (its IAU body frame IS Blender's
 * +Z-up scene), and the prebake's glTF export turns that into glTF +Y-up. Its
 * `bodyFromSource` must undo exactly that turn: anything else draws the moon with
 * the wrong face towards Mars, and no other test would notice.
 */

import { describe, expect, it } from 'vitest';

import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { MESH_SOURCES } from '../../../../tools/utils/io/meshSources';

// meshPrebake.py's `gltf_from_blender`.
const gltfFromBlender = ([x, y, z]: Vec3): Vec3 => [x, z, -y];

describe.each(['phobos', 'deimos'])('MESH_SOURCES.%s', (key) => {
  const entry = MESH_SOURCES[key]!;

  it('maps every exported axis back onto the body frame it was modelled in', () => {
    for (const axis of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as Vec3[]) {
      const back = rotateVec3ByTightMat3(gltfFromBlender(axis), entry.bodyFromSource);
      expect(back[0]).toBeCloseTo(axis[0], 12);
      expect(back[1]).toBeCloseTo(axis[1], 12);
      expect(back[2]).toBeCloseTo(axis[2], 12);
    }
  });

  it('keeps the centre-of-mass origin its orbit tracks', () => {
    expect(entry.origin).toBe('source');
  });
});
