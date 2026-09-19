/**
 * Public surface of the Local Bubble shell renderer: buffers + pipeline for
 * the baked cavity-wall mesh, drawn as an additive Fresnel shell.
 */

import type { ShellMesh } from '../data/shellMesh/ShellMesh';
import type { Vec3 } from '../math/Vec3';

export type LocalBubbleRenderer = {
  readonly label: string;
  upload(mesh: ShellMesh): void;
  /** True once a drawable mesh is committed — the fade row's guard reads this. */
  hasMesh(): boolean;
  /** Frees the GPU vertex/index buffers uploaded by `upload`; `hasMesh()` is false after. */
  clearMesh(): void;
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    eyeMpc: Readonly<Vec3>,
    opacity: number,
  ): void;
  destroy(): void;
};
