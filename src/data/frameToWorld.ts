/**
 * FRAME_TO_WORLD — the model rotation from each `ScalarFieldFrameKind`'s
 * native frame into skymap's world space (equatorial Cartesian).
 */
import { mat4 } from 'wgpu-matrix';
import type { Mat4 as WgpuMat4 } from 'wgpu-matrix';
import type { ScalarFieldFrameKind } from '../@types/data/volume/ScalarFieldFrameKind';
import { mat4dFromMat3 } from '../utils/math/mat4dFromMat3';
import { GAL_TO_EQ_MATRIX, SG_TO_EQ_MAT4_COL_MAJOR } from './superGalacticTransform';

export const FRAME_TO_WORLD: Readonly<Record<ScalarFieldFrameKind, WgpuMat4>> = Object.freeze({
  'supergalactic-cartesian': Float32Array.from(SG_TO_EQ_MAT4_COL_MAJOR) as WgpuMat4,
  'equatorial-cartesian': mat4.identity(),
  galactic: Float32Array.from(mat4dFromMat3(GAL_TO_EQ_MATRIX)) as WgpuMat4,
});
