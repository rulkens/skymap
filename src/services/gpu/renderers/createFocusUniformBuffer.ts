/**
 * createFocusUniformBuffer — allocate the singleton cluster-focus uniform
 * (buffer + bind group + scratch packer) shared by every pipeline that
 * renders the member-isolation dim.
 *
 * ## Why this is the only place that packs FocusUniforms
 *
 * The 32-byte block is laid out as a `vec4 centerRadius` (xyz = centre Mpc,
 * w = radiusMpc) followed by `blend`, `invert`, and two pad words. The vec4
 * (rather than a `vec3` + separate `f32`) is deliberate: WGSL packs a scalar
 * that follows a `vec3<f32>` into the vec3's empty 4th lane at byte 12, but a
 * naive std140-style CPU packer pads the vec3 to 16 bytes — a one-slot skew
 * that silently corrupts every field after it. Centralising the packing here
 * means that subtlety is encoded once instead of re-derived at each call site
 * (points, procedural disks, textured disks). See `lib/focusUniforms.wesl`.
 *
 * At rest every field is zero, which makes the shader's per-vertex multiplier
 * collapse to 1.0 — so a pipeline that never calls `write` (e.g. the pick
 * pass, which only needs a layout-matching dummy) renders unaffected.
 */

import type { FocusUniformsBgl } from '../../../@types/rendering/FocusUniformsBgl';
import type { FocusUniformsValue } from '../../../@types/rendering/FocusUniformsValue';
import type { FocusUniformBuffer } from '../../../@types/rendering/FocusUniformBuffer';

/** Byte size of the FocusUniforms block — see the module docblock for the layout. */
const FOCUS_UNIFORM_BYTES = 32;

export function createFocusUniformBuffer(
  device: GPUDevice,
  focusBgl: FocusUniformsBgl,
  label = 'focus',
): FocusUniformBuffer {
  const buffer = device.createBuffer({
    label: `${label}-focus-uniform`,
    size: FOCUS_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    label: `${label}-focus-bg`,
    layout: focusBgl,
    entries: [{ binding: 0, resource: { buffer } }],
  });

  // Reusable scratch aliased by both views: f32 for centre/radius/blend,
  // u32 for the invert flag. Pad words [6..7] stay zero.
  const scratch = new ArrayBuffer(FOCUS_UNIFORM_BYTES);
  const f32 = new Float32Array(scratch);
  const u32 = new Uint32Array(scratch);

  function write(focus: FocusUniformsValue): void {
    f32[0] = focus.center[0];
    f32[1] = focus.center[1];
    f32[2] = focus.center[2];
    f32[3] = focus.radiusMpc; // vec4 .w
    f32[4] = focus.blend;
    u32[5] = focus.invert;
    device.queue.writeBuffer(buffer, 0, scratch);
  }

  return {
    bindGroup,
    write,
    destroy(): void {
      buffer.destroy();
    },
  };
}
