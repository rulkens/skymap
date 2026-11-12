/**
 * asteroids/{points,kepler}/*.wesl vs the TS side: `AsteroidUniforms` and `KeplerUniforms` against the
 * byte offsets their renderers write, the hand-mirrored constants against their TS tables, and the one
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
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';

const SHADERS = join(process.cwd(), 'src/services/gpu/shaders/asteroids');
const io = readFileSync(join(SHADERS, 'points/io.wesl'), 'utf-8');
const vertex = readFileSync(join(SHADERS, 'points/vertex.wesl'), 'utf-8');
const fragment = readFileSync(join(SHADERS, 'points/fragment.wesl'), 'utf-8');
const compute = readFileSync(join(SHADERS, 'kepler/compute.wesl'), 'utf-8');

const constOf = (src: string, name: string): number =>
  Number(src.match(new RegExp(`const ${name}: (?:f32|u32) = ([-0-9.e]+)u?;`))![1]);

/** The body of `fn name(...)` up to its closing brace at column 0. */
const fnBody = (src: string, name: string): string =>
  src.match(new RegExp(`fn ${name}\\([\\s\\S]*?\\n\\}`))![0];

/** WGSL offsets of `struct name`'s members, and its size rounded to its 16-byte alignment. */
function structLayout(src: string, name: string): [Record<string, number>, number] {
  const body = src.match(new RegExp(`struct ${name} \\{([\\s\\S]*?)\\n\\};`))![1]!;
  const sizes: Record<string, [number, number]> = {
    CameraUniforms: [16, 80],
    'vec3<f32>': [16, 12],
    'array<vec4<f32>, 5>': [16, 80],
    'array<vec4<f32>, 2>': [16, 32],
    f32: [4, 4],
    u32: [4, 4],
  };
  const offsets: Record<string, number> = {};
  let at = 0;
  for (const m of body.matchAll(
    /(\w+)\s*:\s*(CameraUniforms|vec3<f32>|array<vec4<f32>, \d>|f32|u32),/g,
  )) {
    const [align, size] = sizes[m[2]!]!;
    at = Math.ceil(at / align) * align;
    offsets[m[1]!] = at;
    at += size;
  }
  return [offsets, Math.ceil(at / 16) * 16];
}

describe('asteroids shader parity', () => {
  it('AsteroidUniforms offsets match the WGSL struct', () => {
    const [offsets, bytes] = structLayout(io, 'AsteroidUniforms');
    const { viewProj, viewportPx, pxPerRad, ...rest } = ASTEROID_UNIFORM_OFFSETS;
    expect(offsets).toEqual({ cam: viewProj, ...rest });
    expect(bytes).toBe(ASTEROID_UNIFORM_BYTES);
  });

  it('KeplerUniforms offsets match the WGSL struct, one fade lane per class', () => {
    const [offsets, bytes] = structLayout(compute, 'KeplerUniforms');
    expect(offsets).toEqual(KEPLER_UNIFORM_OFFSETS);
    expect(bytes).toBe(KEPLER_UNIFORM_BYTES);
    expect(ASTEROID_CLASSES.length).toBeLessThanOrEqual(8);
  });

  it('mirrors the photometry, format and unit constants', () => {
    expect(ASTEROID_CLASSES).toHaveLength(5);
    expect(constOf(compute, 'NO_H_MAGNITUDE')).toBe(ASTEROID_PHOTOMETRY.noHMagnitude);
    expect(constOf(compute, 'MIN_FLUX') / ASTEROID_PHOTOMETRY.minFlux).toBeCloseTo(1, 12);
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
    expect(constOf(vertex, 'AU_KM')).toBeCloseTo(SCALE_UNITS.AU_TO_MPC / SCALE_UNITS.KM_TO_MPC, 3);
    expect(constOf(vertex, 'MPC_TO_KM') * SCALE_UNITS.KM_TO_MPC).toBeCloseTo(1, 12);
    expect(constOf(fragment, 'DOT_KNEE')).toBe(ASTEROID_PHOTOMETRY.dotKnee);
  });

  it('the compute holds the one cull; the dot and the pick stamp only read its list', () => {
    const cull = fnBody(compute, 'shownRow');
    expect(cull).toMatch(/HIDDEN_FLAG/);
    expect(cull).toMatch(/classFade\[cls >> 2u\]\[cls & 3u\] <= 0\.0/);
    expect(cull).toMatch(/flux < MIN_FLUX/);
    const linked = vertexLinked as string;
    for (const entry of ['vs', 'vsPick']) {
      expect(fnBody(linked, entry), entry).toMatch(/= asteroidDot\(slot\);/);
    }
    expect(fnBody(linked, 'asteroidDot')).toMatch(/visible\[slot\]/);
    expect(linked).not.toMatch(/MIN_FLUX|HIDDEN_FLAG/);
  });
});
