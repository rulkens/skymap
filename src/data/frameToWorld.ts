/**
 * FRAME_TO_WORLD — the model rotation from each `ScalarFieldFrameKind`'s
 * native frame into skymap's world space (equatorial Cartesian). Lives here
 * rather than inside a single renderer's module because every voxel-cube
 * and mesh layer that ships a non-equatorial frame needs the same table;
 * `buildCubeModelMatrix` and the Local Bubble shell both import it.
 */
import { mat4 } from 'wgpu-matrix';
import type { Mat4 as WgpuMat4 } from 'wgpu-matrix';
import type { Mat4 } from '../@types/math/Mat4';
import type { ScalarFieldFrameKind } from '../@types/data/volume/ScalarFieldFrameKind';
import { GAL_TO_EQ_MAT4_COL_MAJOR, SG_TO_EQ_MAT4_COL_MAJOR } from './superGalacticTransform';

// `mat4.create` takes 16 positional values (wgpu-matrix has no `fromValues`);
// the canonical column-major 16-tuples above are the transcription-proof
// source, so every consumer converts through this one spot.
function toWgpuMat4(m: Mat4): WgpuMat4 {
  return mat4.create(
    m[0],
    m[1],
    m[2],
    m[3],
    m[4],
    m[5],
    m[6],
    m[7],
    m[8],
    m[9],
    m[10],
    m[11],
    m[12],
    m[13],
    m[14],
    m[15],
  );
}

export const FRAME_TO_WORLD: Readonly<Record<ScalarFieldFrameKind, WgpuMat4>> = Object.freeze({
  'supergalactic-cartesian': toWgpuMat4(SG_TO_EQ_MAT4_COL_MAJOR),
  'equatorial-cartesian': mat4.identity(),
  galactic: toWgpuMat4(GAL_TO_EQ_MAT4_COL_MAJOR),
});
