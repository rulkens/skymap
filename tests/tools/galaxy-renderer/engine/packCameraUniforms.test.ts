/**
 * packCameraUniforms — the 112-byte camera UBO packer, extracted from the
 * spike's frame loop at galaxy-engine.js:287-292 and matching the WGSL
 * `struct Cam` at galaxy-shaders.js:7-12. Verifies the float layout
 * (viewProj / right / up / params), the known-lookAt right/up basis, and
 * the wgpu-matrix dst-last idiom.
 */
import { describe, expect, it } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import { packCameraUniforms } from '../../../../tools/galaxy-renderer/src/engine/packCameraUniforms';

const ARGS = {
  sizeScale: 1.5,
  starIntensity: 2.25,
  lodApparent: 0.5,
  cullBright: 0.1,
} as const;

// A distinguishable 4x4 so floats-0-15 verbatim copy is unambiguous.
const VIEW_PROJ = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

// A distinguishable view matrix (not a real rotation) purely to check the
// index-picking (view[0], view[4], view[8] / view[1], view[5], view[9]).
const VIEW = new Float32Array([
  100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115,
]);

describe('packCameraUniforms', () => {
  it('output has 28 floats (112 bytes)', () => {
    const out = packCameraUniforms(VIEW_PROJ, VIEW, ARGS);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(28);
    expect(out.byteLength).toBe(112);
  });

  it('viewProj occupies floats 0-15 verbatim', () => {
    const out = packCameraUniforms(VIEW_PROJ, VIEW, ARGS);
    expect(Array.from(out.slice(0, 16))).toEqual(Array.from(VIEW_PROJ));
  });

  it('right vector is the view rotation basis first row with w=0 (known lookAt)', () => {
    // eye [0,0,10] looking at the origin, world +Y up: the camera basis is
    // axis-aligned, so right/up read off cleanly as [1,0,0] / [0,1,0].
    const view = mat4.lookAt([0, 0, 10], [0, 0, 0], [0, 1, 0]);
    const viewProj = mat4.multiply(mat4.perspective(1, 1, 0.1, 100), view);
    const out = packCameraUniforms(viewProj, view, ARGS);
    expect(out[16]).toBeCloseTo(1, 12);
    expect(out[17]).toBeCloseTo(0, 12);
    expect(out[18]).toBeCloseTo(0, 12);
    expect(out[19]).toBe(0);
  });

  it('up vector is the view rotation basis second row with w=0 (known lookAt)', () => {
    const view = mat4.lookAt([0, 0, 10], [0, 0, 0], [0, 1, 0]);
    const viewProj = mat4.multiply(mat4.perspective(1, 1, 0.1, 100), view);
    const out = packCameraUniforms(viewProj, view, ARGS);
    expect(out[20]).toBeCloseTo(0, 12);
    expect(out[21]).toBeCloseTo(1, 12);
    expect(out[22]).toBeCloseTo(0, 12);
    expect(out[23]).toBe(0);
  });

  it('params land at floats 24-27 in order', () => {
    const out = packCameraUniforms(VIEW_PROJ, VIEW, ARGS);
    // Float32 truncation (e.g. 0.1 -> 0.10000000149011612) is expected, so
    // compare with tolerance rather than exact equality.
    expect(out[24]).toBeCloseTo(ARGS.sizeScale, 6);
    expect(out[25]).toBeCloseTo(ARGS.starIntensity, 6);
    expect(out[26]).toBeCloseTo(ARGS.lodApparent, 6);
    expect(out[27]).toBeCloseTo(ARGS.cullBright, 6);
  });

  it('dst is written in place and returned when provided', () => {
    const dst = new Float32Array(28);
    const out = packCameraUniforms(VIEW_PROJ, VIEW, ARGS, dst);
    expect(out).toBe(dst);
    expect(dst[24]).toBeCloseTo(ARGS.sizeScale, 6);
    expect(Array.from(dst.slice(0, 16))).toEqual(Array.from(VIEW_PROJ));
  });
});
