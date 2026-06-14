/**
 * Unit tests for `flowFieldMetaFromCube` — the pure cube → meta mapping that
 * `flowFieldFromCube` runs before the GPU upload.
 *
 * Only the pure helper is exercised here; the upload path needs a real
 * `GPUDevice` and is covered by Phase C's construction smoke test.  These tests
 * run in node with no WebGPU, so they touch nothing but the field mapping and
 * its velocity-field guard.
 */

import { describe, expect, it } from 'vitest';
import type { ScalarCube } from '../../../../src/@types/data/ScalarCube';
import { flowFieldMetaFromCube } from '../../../../src/services/gpu/resources/flowFieldMetaFromCube';

/** A 4-channel velocity cube fixture with known, distinct field values. */
function velocityCube(overrides: Partial<ScalarCube> = {}): ScalarCube {
  const dims: ScalarCube['dims'] = [2, 2, 2];
  return {
    dims,
    channels: 4,
    // The pure helper never reads voxel contents; a correctly-sized but empty
    // buffer is enough for the mapping test.
    voxels: new Uint16Array(dims[0] * dims[1] * dims[2] * 4),
    frameKind: 'supergalactic-cartesian',
    origin: [-110, -120, -130],
    voxelSize: 1.75,
    rotation: [0, 0, 0, 1],
    valueMin: -0.9,
    valueMax: 12.5,
    velocityStats: {
      speedKmsMax: 1480,
      speedKmsP99: 920,
      deltaP99: 6.3,
    },
    ...overrides,
  };
}

describe('flowFieldMetaFromCube', () => {
  it('maps every field', () => {
    const cube = velocityCube();
    const meta = flowFieldMetaFromCube(cube);

    expect(meta.n).toBe(cube.dims[0]);
    expect(meta.origin).toBe(cube.origin);
    expect(meta.voxelSizeMpc).toBe(cube.voxelSize);
    expect(meta.frameKind).toBe(cube.frameKind);
    expect(meta.deltaMin).toBe(cube.valueMin);
    expect(meta.deltaMax).toBe(cube.valueMax);
    expect(meta.speedKmsMax).toBe(cube.velocityStats!.speedKmsMax);
    expect(meta.speedKmsP99).toBe(cube.velocityStats!.speedKmsP99);
    expect(meta.deltaP99).toBe(cube.velocityStats!.deltaP99);
  });

  it('throws on a non-velocity cube', () => {
    // channels !== 4: a plain scalar density cube is not a flow field.
    const scalarCube = velocityCube({ channels: 1, velocityStats: undefined });
    expect(() => flowFieldMetaFromCube(scalarCube)).toThrow();

    // channels === 4 but velocityStats absent: value_kind = 0, not a flow field.
    const statlessCube = velocityCube({ velocityStats: undefined });
    expect(() => flowFieldMetaFromCube(statlessCube)).toThrow();
  });
});
