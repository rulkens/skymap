import type { ScalarFieldFrameKind } from '../volume/ScalarFieldFrameKind';
import type { Vec3 } from '../../math/Vec3';
import type { ShellMeshDtype } from './ShellMeshDtype';

/**
 * ShellMesh — decoded `.shell` runtime mesh: a displaced-sphere shell (the
 * Local Bubble cavity wall), positions and normals in `frame`, centre-relative
 * parsecs. `positions`/`normals` carry raw f16 bit patterns as a `Uint16Array`
 * when `dtype` is 'f16' — the same bytes the WebGPU `float16x4` vertex format
 * reads, so no per-element conversion happens between decode and GPU upload.
 */
export type ShellMesh = {
  dtype: ShellMeshDtype;
  frame: ScalarFieldFrameKind;
  centrePc: Vec3;
  vertexCount: number;
  positions: Uint16Array | Float32Array; // 4 components/vertex, w = 1
  normals: Uint16Array | Float32Array; // 4 components/vertex, w = 0
  indices: Uint32Array;
};
