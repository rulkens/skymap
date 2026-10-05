/**
 * missionTrail/io.wesl vs missionTrailRenderer layout parity: the vertex struct
 * against the endpoint attribute table, and `TrailUniforms` against the byte
 * offsets the renderer writes. A drift reads garbage on hardware, silently.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TRAIL_UNIFORM_BYTES,
  TRAIL_UNIFORM_OFFSETS,
  TRAIL_VERTEX_STRIDE,
  endpointAttributes,
} from '../../../../src/services/gpu/renderers/bodies/missionTrailRenderer';

const io = readFileSync(
  join(process.cwd(), 'src/services/gpu/shaders/bodies/missionTrail/io.wesl'),
  'utf-8',
);

describe('missionTrail/io.wesl parity', () => {
  it('TrailSegment locations, types and offsets match the endpoint attribute table', () => {
    const body = io.match(/struct TrailSegment \{([\s\S]*?)\n\};/)![1]!;
    const fields = [...body.matchAll(/@location\((\d+)\)\s+(\w+)\s*:\s*vec3<f32>,/g)].map((m) => ({
      location: Number(m[1]),
      name: m[2]!,
    }));
    expect(fields).toEqual([
      { location: 0, name: 'aHi' },
      { location: 1, name: 'aLo' },
      { location: 2, name: 'bHi' },
      { location: 3, name: 'bLo' },
    ]);
    const attrs = [...endpointAttributes(0), ...endpointAttributes(2)];
    for (const f of fields) {
      const a = attrs.find((x) => x.shaderLocation === f.location)!;
      expect(a.format).toBe('float32x3');
      expect(a.offset).toBe((f.location % 2) * 12);
    }
    expect(TRAIL_VERTEX_STRIDE).toBe(24);
  });

  it('TrailUniforms lays out where the renderer writes it', () => {
    const body = io.match(/struct TrailUniforms \{([\s\S]*?)\n\};/)![1]!;
    const sizes: Record<string, [number, number]> = {
      CameraUniforms: [16, 80],
      'vec3<f32>': [16, 12],
      f32: [4, 4],
    };
    const offsets: Record<string, number> = {};
    let at = 0;
    for (const m of body.matchAll(/(\w+)\s*:\s*(CameraUniforms|vec3<f32>|f32),/g)) {
      const [align, size] = sizes[m[2]!]!;
      at = Math.ceil(at / align) * align;
      offsets[m[1]!] = at;
      at += size;
    }
    expect(offsets).toEqual({
      cam: 0,
      camHi: TRAIL_UNIFORM_OFFSETS.camHi,
      opacity: TRAIL_UNIFORM_OFFSETS.opacity,
      camLo: TRAIL_UNIFORM_OFFSETS.camLo,
      widthPx: TRAIL_UNIFORM_OFFSETS.widthPx,
      color: TRAIL_UNIFORM_OFFSETS.color,
    });
    expect(Math.ceil(at / 16) * 16).toBe(TRAIL_UNIFORM_BYTES);
    // CameraUniforms prefix: viewProj 0, viewportPx 64, pxPerRad 72.
    expect([
      TRAIL_UNIFORM_OFFSETS.viewProj,
      TRAIL_UNIFORM_OFFSETS.viewportPx,
      TRAIL_UNIFORM_OFFSETS.pxPerRad,
    ]).toEqual([0, 64, 72]);
  });
});
