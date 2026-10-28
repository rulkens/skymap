/**
 * satellites/points/io.wesl vs satellitePointRenderer layout parity: the instance struct against the
 * attribute table, and `SatelliteUniforms` against the byte offsets the renderer writes. A drift
 * reads garbage on hardware, silently.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SATELLITE_INSTANCE_ATTRIBUTES,
  SATELLITE_INSTANCE_STRIDE,
  SATELLITE_UNIFORM_BYTES,
  SATELLITE_UNIFORM_OFFSETS,
} from '../../../../src/layers/satellites/render/satellitePointRenderer';

const io = readFileSync(
  join(process.cwd(), 'src/services/gpu/shaders/satellites/points/io.wesl'),
  'utf-8',
);

describe('satellites/points/io.wesl parity', () => {
  it('SatelliteInstance locations and offsets match the attribute table', () => {
    const body = io.match(/struct SatelliteInstance \{([\s\S]*?)\n\};/)![1]!;
    const formatOf: Record<string, [GPUVertexFormat, number]> = {
      'vec3<f32>': ['float32x3', 12],
      u32: ['uint32', 4],
    };
    let at = 0;
    const fields = [...body.matchAll(/@location\((\d+)\)\s+\w+\s*:\s*(vec3<f32>|u32),/g)].map(
      (m) => {
        const [format, size] = formatOf[m[2]!]!;
        const row = [Number(m[1]), at, format];
        at += size;
        return row;
      },
    );
    expect(
      SATELLITE_INSTANCE_ATTRIBUTES.map((a) => [a.shaderLocation, a.offset, a.format]),
    ).toEqual(fields);
    expect(SATELLITE_INSTANCE_STRIDE).toBe(at);
  });

  it('SatelliteUniforms lays out where the renderer writes it', () => {
    const body = io.match(/struct SatelliteUniforms \{([\s\S]*?)\n\};/)![1]!;
    const sizes: Record<string, [number, number]> = {
      CameraUniforms: [16, 80],
      'vec3<f32>': [16, 12],
      f32: [4, 4],
      u32: [4, 4],
    };
    const offsets: Record<string, number> = {};
    let at = 0;
    for (const m of body.matchAll(/(\w+)\s*:\s*(CameraUniforms|vec3<f32>|f32|u32),/g)) {
      const [align, size] = sizes[m[2]!]!;
      at = Math.ceil(at / align) * align;
      offsets[m[1]!] = at;
      at += size;
    }
    const { viewProj, viewportPx, pxPerRad, ...rest } = SATELLITE_UNIFORM_OFFSETS;
    expect(offsets).toEqual({ cam: viewProj, ...rest });
    expect(Math.ceil(at / 16) * 16).toBe(SATELLITE_UNIFORM_BYTES);
    expect([viewProj, viewportPx, pxPerRad]).toEqual([0, 64, 72]);
  });
});
