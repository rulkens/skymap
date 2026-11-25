/**
 * asteroids/{points,kepler}/*.wesl vs the TS side: `AsteroidUniforms` and `KeplerUniforms` against the
 * byte offsets their renderers write, the hand-mirrored format constants against their TS tables, and the one
 * cull: the compute keeps the list, both vertex entry points read only it (a pick stamp that culled
 * differently would let an invisible dot take a click).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import vertexLinked from '../../../../src/services/gpu/shaders/asteroids/points/vertex.wesl?static';
import {
  ASTEROID_UNIFORM_BYTES,
  ASTEROID_UNIFORM_OFFSETS,
} from '../../../../src/layers/asteroids/points/render/asteroidPointRenderer';
import {
  KEPLER_UNIFORM_BYTES,
  KEPLER_UNIFORM_OFFSETS,
  KEPLER_WORKGROUP_SIZE,
} from '../../../../src/layers/asteroids/kepler/render/asteroidKeplerSolver';
import { ASTEROID_PHOTOMETRY } from '../../../../src/layers/asteroids/points/data/asteroidPhotometry';
import { ASTEROID_FORMAT } from '../../../../src/data/asteroids/asteroidFormat';
import { ASTEROID_HIDDEN_FLAG } from '../../../../src/layers/asteroids/catalog/data/asteroidHiddenFlag';
import { ASTEROID_CLASSES } from '../../../../src/data/asteroids/asteroidClasses';
import { KEPLER_FIXED } from '../../../../src/data/orbit/keplerFixed';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { weslStructLayout } from '../../../helpers/wesl/weslStructLayout';

const SHADERS = join(process.cwd(), 'src/services/gpu/shaders/asteroids');
const io = readFileSync(join(SHADERS, 'points/io.wesl'), 'utf-8');
const vertex = readFileSync(join(SHADERS, 'points/vertex.wesl'), 'utf-8');
const compute = readFileSync(join(SHADERS, 'kepler/compute.wesl'), 'utf-8');

const constOf = (src: string, name: string): number =>
  Number(src.match(new RegExp(`const ${name}: (?:f32|u32) = ([-0-9.e]+)u?;`))![1]);

/** WGSL offsets of a uniform `struct name`'s members, and its size. */
function uniformOffsets(src: string, name: string): [Record<string, number>, number] {
  const { fields, size } = weslStructLayout(src, name, 'uniform');
  return [Object.fromEntries(fields.map((field) => [field.name, field.offset])), size];
}

describe('asteroids shader parity', () => {
  it('AsteroidUniforms offsets match the WGSL struct', () => {
    const [offsets, bytes] = uniformOffsets(io, 'AsteroidUniforms');
    const { viewProj, viewportPx, pxPerRad, ...rest } = ASTEROID_UNIFORM_OFFSETS;
    expect(offsets).toEqual({ cam: viewProj, ...rest });
    expect(bytes).toBe(ASTEROID_UNIFORM_BYTES);
  });

  it('KeplerUniforms offsets match the WGSL struct', () => {
    const [offsets, bytes] = uniformOffsets(compute, 'KeplerUniforms');
    expect(offsets).toEqual(KEPLER_UNIFORM_OFFSETS);
    expect(bytes).toBe(KEPLER_UNIFORM_BYTES);
  });

  it('mirrors the photometry, format and unit constants', () => {
    expect(ASTEROID_CLASSES).toHaveLength(4);
    expect(constOf(compute, 'MIN_DELTA_AU')).toBe(ASTEROID_PHOTOMETRY.minDeltaAu);
    expect(constOf(compute, 'CLASS_MASK')).toBe(ASTEROID_FORMAT.flagClassMask);
    expect(constOf(compute, 'LAST_CLASS')).toBe(ASTEROID_CLASSES.length - 1);
    expect(constOf(compute, 'HIDDEN_FLAG')).toBe(ASTEROID_HIDDEN_FLAG);
    expect(constOf(compute, 'H_NONE')).toBe(ASTEROID_FORMAT.hNone);
    expect(constOf(compute, 'H_OFFSET')).toBe(ASTEROID_FORMAT.hOffset);
    expect(constOf(compute, 'H_SCALE')).toBe(ASTEROID_FORMAT.hScale);
    expect(constOf(compute, 'G_OFFSET')).toBe(ASTEROID_FORMAT.gOffset);
    expect(constOf(compute, 'G_SCALE')).toBe(ASTEROID_FORMAT.gScale);
    expect(constOf(compute, 'WORKGROUP_SIZE')).toBe(KEPLER_WORKGROUP_SIZE);
    expect(constOf(vertex, 'MAIN_BELT')).toBe(ASTEROID_CLASSES.indexOf('mainBelt'));
    expect(constOf(vertex, 'AU_KM')).toBeCloseTo(SCALE_UNITS.AU_TO_MPC / SCALE_UNITS.KM_TO_MPC, 3);
    expect(constOf(vertex, 'MPC_TO_KM') * SCALE_UNITS.KM_TO_MPC).toBeCloseTo(1, 12);
  });

  it('the Kepler solver constants match the TS twin', () => {
    const kepler = readFileSync(
      join(process.cwd(), 'src/services/gpu/shaders/lib/kepler.wesl'),
      'utf-8',
    );
    expect(constOf(kepler, 'KEPLER_STEPS')).toBe(KEPLER_FIXED.steps);
    expect(constOf(kepler, 'KEPLER_MAX_STEP')).toBe(KEPLER_FIXED.maxStep);
    expect(kepler).toContain(
      `eccAnomaly = meanReduced + ${KEPLER_FIXED.danbyStart} * ecc * sign(meanReduced)`,
    );
  });
});
