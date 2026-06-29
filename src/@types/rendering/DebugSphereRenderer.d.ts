/**
 * DebugSphereRenderer — handle for the unit-sphere debug overlay.
 *
 * Draws a UV-sphere mesh in the foreground depth pass so its fragments
 * compete with other foreground geometry for depth ownership. The
 * foreground pass owns the depth attachment (`depthWriteEnabled: true`,
 * `depthCompare: 'less'`), so a debug sphere placed at a body's world
 * position correctly occludes and is occluded by other foreground draws.
 *
 * ### Why a debug renderer at all
 *
 * At Earth scale the sphere occupies sub-pixel footprints unless the
 * camera is very close. Eyeballing roundness, jitter, and pole
 * orientation at that scale requires a shader that exaggerates structure
 * visually — the lat-long grid in `debugSphere/fragment.wesl` does that
 * cheaply with no extra geometry. Once the Earth renderer (Plan 02)
 * ships, this renderer can be retired or kept as a hidden diagnostic
 * toggle.
 *
 * ### Shared library
 *
 * `lib/sphere.wesl` owns `SphereUniforms` (64 bytes — one mat4x4<f32>)
 * and the `clip_from_local` helper. Both the debug vertex stage and the
 * future Earth vertex stage import from there, so the CPU-side uniform
 * layout and the GPU-side projection are a single source of truth.
 */

import type { Renderer } from './Renderer';

export type DebugSphereRenderer = Renderer & {
  /**
   * Issue a single indexed draw for the UV-sphere mesh.
   *
   * `mvp` must be a length-16 Float32Array (column-major mat4x4<f32>,
   * 64 bytes) that folds model scale + translate + view + projection.
   * The value is written into the `SphereUniforms` uniform buffer with
   * `queue.writeBuffer` before the draw call.
   */
  draw(pass: GPURenderPassEncoder, mvp: Float32Array): void;
};
