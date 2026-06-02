/**
 * FocusUniformBuffer — the singleton cluster-focus uniform a pipeline binds
 * to render the member-isolation dim. Owns the 32-byte GPU buffer, its bind
 * group, and a reusable scratch packer; `createFocusUniformBuffer` is the
 * single place that knows the `vec4 centerRadius + blend + invert` byte
 * layout (mirrored in `lib/focusUniforms.wesl`).
 *
 * One POI is focused at a time, so every pipeline (points, procedural disks,
 * textured disks) holds exactly one of these and writes it once per frame.
 */

import type { FocusUniformsValue } from './FocusUniformsValue';

export type FocusUniformBuffer = {
  /** Bind group wrapping the focus buffer — bound at the pipeline's focus group. */
  readonly bindGroup: GPUBindGroup;
  /** Pack `focus` into the shared layout and upload it. */
  write(focus: FocusUniformsValue): void;
  /** Release the underlying GPU buffer. Idempotent. */
  destroy(): void;
};
