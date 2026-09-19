/**
 * FRAME_TO_WORLD — the model rotation from each `ScalarFieldFrameKind`'s
 * native frame into skymap's world space (equatorial Cartesian). Lives here
 * rather than inside a single renderer's module because every voxel-cube
 * and mesh layer that ships a non-equatorial frame needs the same table;
 * `buildCubeModelMatrix` and the Local Bubble shell both import it.
 */
import { mat4 } from 'wgpu-matrix';
import type { Mat4 as WgpuMat4 } from 'wgpu-matrix';
import type { ScalarFieldFrameKind } from '../@types/data/volume/ScalarFieldFrameKind';
import { GAL_TO_EQ_MAT4_COL_MAJOR, SG_TO_EQ_MAT4_COL_MAJOR } from './superGalacticTransform';

export const FRAME_TO_WORLD: Readonly<Record<ScalarFieldFrameKind, WgpuMat4>> = Object.freeze({
  'supergalactic-cartesian': Float32Array.from(SG_TO_EQ_MAT4_COL_MAJOR) as WgpuMat4,
  'equatorial-cartesian': mat4.identity(),
  galactic: Float32Array.from(GAL_TO_EQ_MAT4_COL_MAJOR) as WgpuMat4,
});
