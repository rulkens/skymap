import type { ScalarFieldFrameKind } from '../volume/ScalarFieldFrameKind';
import type { Vec3 } from '../../math/Vec3';
import type { ShellMeshDtype } from './ShellMeshDtype';

/** ShellMesh — decoded `.shell` runtime mesh: the Local Bubble cavity-wall shell, positions and normals in `frame`, centre-relative parsecs. */
export type ShellMesh = {
  dtype: ShellMeshDtype;
  frame: ScalarFieldFrameKind;
  centrePc: Vec3;
  vertexCount: number;
  positions: Uint16Array | Float32Array; // 4 components/vertex, w = 1
  normals: Uint16Array | Float32Array; // 4 components/vertex, w = 0
  indices: Uint32Array;
};
