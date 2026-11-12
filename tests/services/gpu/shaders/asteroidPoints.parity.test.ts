/**
 * asteroids/points/*.wesl vs the TS side: `AsteroidUniforms` against the byte offsets the renderer
 * writes, the hand-mirrored constants against their TS tables, and the one cull both vertex entry
 * points go through (a pick stamp that culled differently would let an invisible dot take a click).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import vertexLinked from '../../../../src/services/gpu/shaders/asteroids/points/vertex.wesl?static';
import {
  ASTEROID_UNIFORM_BYTES,
  ASTEROID_UNIFORM_OFFSETS,
} from '../../../../src/layers/asteroids/points/render/asteroidPointRenderer';
import { KEPLER_WORKGROUP_SIZE } from '../../../../src/layers/asteroids/kepler/render/asteroidKeplerSolver';
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

describe('asteroids/points/io.wesl parity', () => {
  it('uniform offsets match the WGSL struct', () => {
    const body = io.match(/struct AsteroidUniforms \{([\s\S]*?)\n\};/)![1]!;
    const sizes: Record<string, [number, number]> = {
      CameraUniforms: [16, 80],
      'vec3<f32>': [16, 12],
      'array<vec4<f32>, 5>': [16, 80],
      f32: [4, 4],
      u32: [4, 4],
    };
    const offsets: Record<string, number> = {};
    let at = 0;
    for (const m of body.matchAll(
      /(\w+)\s*:\s*(CameraUniforms|vec3<f32>|array<vec4<f32>, 5>|f32|u32),/g,
    )) {
      const [align, size] = sizes[m[2]!]!;
      at = Math.ceil(at / align) * align;
      offsets[m[1]!] = at;
      at += size;
    }
    const { viewProj, viewportPx, pxPerRad, ...rest } = ASTEROID_UNIFORM_OFFSETS;
    expect(offsets).toEqual({ cam: viewProj, ...rest });
    expect(Math.ceil(at / 16) * 16).toBe(ASTEROID_UNIFORM_BYTES);
    expect(ASTEROID_CLASSES).toHaveLength(5);
  });

  it('mirrors the photometry, format and unit constants', () => {
    expect(constOf(vertex, 'NO_H_MAGNITUDE')).toBe(ASTEROID_PHOTOMETRY.noHMagnitude);
    expect(constOf(vertex, 'MIN_FLUX') / ASTEROID_PHOTOMETRY.minFlux).toBeCloseTo(1, 12);
    expect(constOf(vertex, 'MIN_DELTA_AU')).toBe(ASTEROID_PHOTOMETRY.minDeltaAu);
    expect(constOf(vertex, 'CLASS_MASK')).toBe(ASTEROID_FORMAT.flagClassMask);
    expect(constOf(vertex, 'LAST_CLASS')).toBe(ASTEROID_CLASSES.length - 1);
    expect(constOf(vertex, 'HIDDEN_FLAG')).toBe(ASTEROID_HIDDEN_FLAG);
    expect(constOf(vertex, 'H_NONE')).toBe(ASTEROID_FORMAT.hNone);
    expect(constOf(vertex, 'H_OFFSET')).toBe(ASTEROID_FORMAT.hOffset);
    expect(constOf(vertex, 'H_SCALE')).toBe(ASTEROID_FORMAT.hScale);
    expect(constOf(vertex, 'G_OFFSET')).toBe(ASTEROID_FORMAT.gOffset);
    expect(constOf(vertex, 'G_SCALE')).toBe(ASTEROID_FORMAT.gScale);
    expect(constOf(vertex, 'AU_KM')).toBeCloseTo(SCALE_UNITS.AU_TO_MPC / SCALE_UNITS.KM_TO_MPC, 3);
    expect(constOf(vertex, 'MPC_TO_KM') * SCALE_UNITS.KM_TO_MPC).toBeCloseTo(1, 12);
    expect(constOf(fragment, 'DOT_KNEE')).toBe(ASTEROID_PHOTOMETRY.dotKnee);
    expect(constOf(compute, 'WORKGROUP_SIZE')).toBe(KEPLER_WORKGROUP_SIZE);
  });

  it('the pick stamp and the dot share one cull', () => {
    const linked = vertexLinked as string;
    for (const entry of ['vs', 'vsPick']) {
      expect(fnBody(linked, entry), entry).toMatch(/= asteroidDot\(row\);/);
    }
    const cull = fnBody(linked, 'asteroidDot');
    expect(cull).toMatch(/HIDDEN_FLAG/);
    expect(cull).toMatch(/classColor\[cls\]\.w <= 0\.0/);
    expect(cull).toMatch(/flux < MIN_FLUX/);
  });
});
