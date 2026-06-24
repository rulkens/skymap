/**
 * FocusUniformBuffer — the singleton cluster-focus uniform that renders the
 * member-isolation dim. Owns the 32-byte GPU buffer and a reusable scratch
 * packer; `createFocusUniformBuffer` is the single place that knows the
 * `vec4 centerApparent + blend + physicalRadiusMpc` byte layout (mirrored in
 * `lib/focusUniforms.wesl`).
 *
 * The buffer is exposed (not a bind group): the scene bind group that composes
 * focus with its co-tenants (lensing, later the LUT) is assembled separately by
 * `createSceneBindGroup`. One POI is focused at a time, so one instance lives on
 * `state.gpu.focusUniform` and is written once per frame.
 */

import type { FocusUniformsValue } from './FocusUniformsValue';

export type FocusUniformBuffer = {
  /** The raw focus uniform buffer — referenced by `createSceneBindGroup` at binding 0. */
  readonly buffer: GPUBuffer;
  /** Pack `focus` into the shared layout and upload it. */
  write(focus: FocusUniformsValue): void;
  /** Release the underlying GPU buffer. Idempotent. */
  destroy(): void;
};
