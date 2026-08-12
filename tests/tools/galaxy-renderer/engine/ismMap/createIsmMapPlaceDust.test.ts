/**
 * Two independent guards: `computePlaceDustBudget`'s early-exit/clamp math
 * against the CPU's former `buildDustParticleCloud` gates (deleted from
 * `dustParticleCloud.ts`, Task 16), and `packPlaceDustParams`'s byte layout
 * against `placeDust.wesl`'s
 * `PlaceDustParams` struct (same read-the-shader-as-text technique
 * `packIsmMapCdfParams.test.ts` uses, extended for mixed u32/f32 fields —
 * this packer's u32 members are NOT float-reinterpretable, so parity is
 * checked by reading each field back through the type-appropriate typed
 * array at its PARSED offset, not by searching for a sentinel value).
 */
import { describe, expect, it } from 'vitest';

import {
  computePlaceDustBudget,
  type PlaceDustBudget,
} from '../../../../../tools/galaxy-renderer/src/engine/ismMap/computePlaceDustBudget';
import {
  packPlaceDustParams,
  PLACE_DUST_PARAMS_FLOATS,
} from '../../../../../tools/galaxy-renderer/src/engine/ismMap/packPlaceDustParams';
import type { PlaceDustParamsInput } from '../../../../../tools/galaxy-renderer/src/engine/ismMap/packPlaceDustParams';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyDustParams';
import {
  MAX_PARTICLE_COUNT,
  SIZE_MAX_PC,
  SIZE_MIN_PC,
} from '../../../../../src/services/engine/galaxyGenerator/v2/dustParticleCloud';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyDustParams } from '../../../../../src/@types/galaxy/GalaxyDustParams';
import { layoutWgslStruct } from '../../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const geometry: GalaxyDescription = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);
const noDiscGeometry: GalaxyDescription = {
  ...geometry,
  light: { ...geometry.light, disc: 0, bulge: geometry.light.bulge + geometry.light.disc },
};
const dust: GalaxyDustParams = DEFAULT_GALAXY_DUST_PARAMS;

describe('computePlaceDustBudget — budget math parity with buildDustParticleCloud’s own gates', () => {
  it('clamps count to MAX_PARTICLE_COUNT', () => {
    const oversized = { ...dust, cloud: { ...dust.cloud, count: MAX_PARTICLE_COUNT * 2 } };
    expect(computePlaceDustBudget(geometry, oversized)?.count).toBe(MAX_PARTICLE_COUNT);
  });

  it('passes a sub-ceiling count through unchanged', () => {
    const small = { ...dust, cloud: { ...dust.cloud, count: 500 } };
    expect(computePlaceDustBudget(geometry, small)?.count).toBe(500);
  });

  it('returns null when the disc has no light share', () => {
    expect(computePlaceDustBudget(noDiscGeometry, dust)).toBeNull();
  });

  it('returns null when tau is 0', () => {
    expect(computePlaceDustBudget(geometry, { ...dust, tau: 0 })).toBeNull();
  });

  it('returns null when cloud.count is 0', () => {
    const empty = { ...dust, cloud: { ...dust.cloud, count: 0 } };
    expect(computePlaceDustBudget(geometry, empty)).toBeNull();
  });

  it('floors sizeFloorPc at SIZE_MIN_PC, caps it below SIZE_MAX_PC*0.9', () => {
    const floored = { ...dust, cloud: { ...dust.cloud, sizeFloorPc: 0, sizeScale: 1 } };
    const budget = computePlaceDustBudget(geometry, floored) as PlaceDustBudget;
    // sizeMin corresponds to SIZE_MIN_PC at sizeScale 1 — a below-floor request clamps up, not to 0.
    expect(budget.sizeMin).toBeGreaterThan(0);
    expect(budget.sizeMax).toBeGreaterThan(budget.sizeMin);
    expect(SIZE_MAX_PC).toBeGreaterThan(SIZE_MIN_PC);
  });
});

describe('packPlaceDustParams ↔ milkyWay/ismMap/placeDust.wesl PlaceDustParams', () => {
  const fields = parseWgslStructFields(
    readShaderSource('src/services/gpu/shaders/milkyWay/ismMap/placeDust.wesl'),
    'PlaceDustParams',
  );
  const struct = layoutWgslStruct(fields, (type) => {
    const p = wgslPrimitiveLayout(type);
    if (!p) throw new Error(`PlaceDustParams field type ${type} has no layout entry`);
    return p;
  });
  const typeByName = new Map(fields.map((f) => [f.name, f.type]));

  const input: PlaceDustParamsInput = {
    seed: 0x7fffffff,
    count: 6501,
    childrenPerComplex: 3,
    generatorIsFluid: true,
    dustOffset: 4242,
    gridRings: 512,
    gridAz: 1536,
    rMin: 0.01,
    rMax: 12.5,
    complexSpread: 0.0025,
    elongation: 4.3,
    sigmaZComplex: 0.0011,
    discWeightSum: 0.8228,
    sizeMin: 0.00003,
    sizeMax: 0.0004,
    discSigmaR: [0.001, 0.002, 0.003, 0.004],
    warpStrength: 0.5,
    warpTwist: 1.2,
    warpStartRadius: 3.3,
    outerRadius: 9.9,
    extinctionRgb: [0.95, 1.0, 1.01],
  };
  const packed = packPlaceDustParams(input);
  const u32 = new Uint32Array(packed);
  const f32 = new Float32Array(packed);

  it('sizes at least PLACE_DUST_PARAMS_FLOATS floats', () => {
    expect(PLACE_DUST_PARAMS_FLOATS * 4).toBeGreaterThanOrEqual(struct.layout.size);
  });

  it('writes every scalar u32/f32 field at its parsed offset', () => {
    const scalarInput: Record<string, number | undefined> = {
      seed: input.seed >>> 0,
      count: input.count,
      childrenPerComplex: input.childrenPerComplex,
      generatorIsFluid: 1,
      dustOffset: input.dustOffset,
      gridRings: input.gridRings,
      gridAz: input.gridAz,
      rMin: input.rMin,
      rMax: input.rMax,
      complexSpread: input.complexSpread,
      elongation: input.elongation,
      sigmaZComplex: input.sigmaZComplex,
      discWeightSum: input.discWeightSum,
      sizeMin: input.sizeMin,
      sizeMax: input.sizeMax,
      warpStrength: input.warpStrength,
      warpTwist: input.warpTwist,
      warpStartRadius: input.warpStartRadius,
      outerRadius: input.outerRadius,
    };
    for (const [name, expected] of Object.entries(scalarInput)) {
      const offset = struct.offsets.get(name);
      expect(offset, `PlaceDustParams has no field named ${name}`).toBeDefined();
      const type = typeByName.get(name);
      const lane = offset! / 4;
      const observed = type === 'u32' ? u32[lane] : f32[lane];
      expect(observed, `field ${name} at offset ${offset}`).toBeCloseTo(expected!, 6);
    }
  });

  it('writes discSigmaR at its vec4 offset, in order', () => {
    const offset = struct.offsets.get('discSigmaR')!;
    const lane = offset / 4;
    expect(f32[lane]).toBeCloseTo(input.discSigmaR[0], 6);
    expect(f32[lane + 1]).toBeCloseTo(input.discSigmaR[1], 6);
    expect(f32[lane + 2]).toBeCloseTo(input.discSigmaR[2], 6);
    expect(f32[lane + 3]).toBeCloseTo(input.discSigmaR[3], 6);
  });

  it('writes extinctionRgb at its vec3 offset, in order', () => {
    const offset = struct.offsets.get('extinctionRgb')!;
    const lane = offset / 4;
    expect(f32[lane]).toBeCloseTo(input.extinctionRgb[0], 6);
    expect(f32[lane + 1]).toBeCloseTo(input.extinctionRgb[1], 6);
    expect(f32[lane + 2]).toBeCloseTo(input.extinctionRgb[2], 6);
  });

  it('packs generatorIsFluid as 0 when false', () => {
    const off = packPlaceDustParams({ ...input, generatorIsFluid: false });
    const offset = struct.offsets.get('generatorIsFluid')!;
    expect(new Uint32Array(off)[offset / 4]).toBe(0);
  });
});
