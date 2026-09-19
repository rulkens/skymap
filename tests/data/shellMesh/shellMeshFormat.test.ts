import { describe, expect, it } from 'vitest';

import type { ShellMesh } from '../../../src/@types/data/shellMesh/ShellMesh';
import type { ShellMeshDtype } from '../../../src/@types/data/shellMesh/ShellMeshDtype';
import { decodeShellMesh, encodeShellMesh } from '../../../src/data/shellMesh/shellMeshFormat';

/** Two triangles sharing an edge: 4 vertices, 6 indices, a non-zero centre. */
function makeFixture(dtype: ShellMeshDtype): ShellMesh {
  const positions =
    dtype === 'f16'
      ? new Uint16Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
      : new Float32Array([0, 0, 300, 1, 100, 0, 280, 1, 0, 100, 290, 1, -100, 0, 285, 1]);
  const normals =
    dtype === 'f16'
      ? new Uint16Array([17, 18, 19, 0, 20, 21, 22, 0, 23, 24, 25, 0, 26, 27, 28, 0])
      : new Float32Array([0, 0, 1, 0, 0.1, 0, 0.99, 0, 0, 0.1, 0.99, 0, -0.1, 0, 0.99, 0]);
  return {
    dtype,
    frame: 'galactic',
    centrePc: [1.5, -2.5, 0.25],
    vertexCount: 4,
    positions,
    normals,
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

describe('shell mesh format (SHEL v1)', () => {
  it('round-trips an f16 mesh', () => {
    const original = makeFixture('f16');
    const decoded = decodeShellMesh(encodeShellMesh(original));
    expect(decoded.dtype).toBe('f16');
    expect(decoded.frame).toBe('galactic');
    expect(Array.from(decoded.centrePc)).toEqual([1.5, -2.5, 0.25]);
    expect(decoded.vertexCount).toBe(4);
    expect(Array.from(decoded.positions)).toEqual(Array.from(original.positions));
    expect(Array.from(decoded.normals)).toEqual(Array.from(original.normals));
    expect(Array.from(decoded.indices)).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it('round-trips an f32 mesh', () => {
    const original = makeFixture('f32');
    const decoded = decodeShellMesh(encodeShellMesh(original));
    expect(decoded.dtype).toBe('f32');
    expect(decoded.frame).toBe('galactic');
    expect(Array.from(decoded.positions)).toEqual(Array.from(original.positions));
    expect(Array.from(decoded.normals)).toEqual(Array.from(original.normals));
  });

  it('rejects a bad magic', () => {
    const buf = new ArrayBuffer(32);
    expect(() => decodeShellMesh(buf)).toThrow(/magic/);
    expect(() => decodeShellMesh(buf)).toThrow(/build-local-bubble/);
  });

  it('rejects an unknown version', () => {
    const buf = encodeShellMesh(makeFixture('f32'));
    new DataView(buf).setUint32(4, 99, true);
    expect(() => decodeShellMesh(buf)).toThrow(/version/);
    expect(() => decodeShellMesh(buf)).toThrow(/build-local-bubble/);
  });

  it('rejects an unknown dtype', () => {
    const buf = encodeShellMesh(makeFixture('f32'));
    new DataView(buf).setUint8(8, 7);
    expect(() => decodeShellMesh(buf)).toThrow(/dtype/);
    expect(() => decodeShellMesh(buf)).toThrow(/build-local-bubble/);
  });

  it('rejects an unknown frame', () => {
    const buf = encodeShellMesh(makeFixture('f32'));
    new DataView(buf).setUint8(9, 9);
    expect(() => decodeShellMesh(buf)).toThrow(/frame/);
    expect(() => decodeShellMesh(buf)).toThrow(/build-local-bubble/);
  });

  it('rejects a truncated buffer', () => {
    const buf = encodeShellMesh(makeFixture('f32'));
    const truncated = buf.slice(0, buf.byteLength - 4);
    expect(() => decodeShellMesh(truncated)).toThrow(/build-local-bubble/);
  });
});
