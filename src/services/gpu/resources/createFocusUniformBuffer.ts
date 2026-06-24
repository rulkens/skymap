/**
 * createFocusUniformBuffer — allocate the single engine-owned cluster-focus
 * uniform (buffer + scratch packer). One structure is focused at a time, so
 * one instance lives on `state.gpu.focusUniform`; `renderFrame` writes it once
 * per frame.
 *
 * This factory owns ONLY the focus buffer. The bind group that composes focus
 * (binding 0) with its scene-group co-tenants (the lensing buffer at binding 1,
 * and later the lensing LUT) is assembled separately by `createSceneBindGroup`
 * from the already-built buffers — so the per-tenant wiring grows there, not in
 * this focus-specific factory. The buffer is exposed for that assembler to
 * reference.
 *
 * ## Why this is the only place that packs FocusUniforms
 *
 * The 32-byte block is laid out as a `vec4 centerApparent` (xyz = centre Mpc,
 * w = apparentRadiusMpc) followed by `blend`, `physicalRadiusMpc`, and two
 * pad words. The vec4 (rather
 * than a `vec3` + separate `f32`) is deliberate: WGSL packs a scalar that
 * follows a `vec3<f32>` into the vec3's empty 4th lane at byte 12, but a
 * naive std140-style CPU packer pads the vec3 to 16 bytes — a one-slot skew
 * that silently corrupts every field after it. Encoding that subtlety in one
 * factory keeps it from being re-derived per pipeline. See
 * `lib/focusUniforms.wesl`.
 */

import type { FocusUniformsValue } from '../../../@types/rendering/FocusUniformsValue';
import type { FocusUniformBuffer } from '../../../@types/rendering/FocusUniformBuffer';

/** Byte size of the FocusUniforms block — see the module docblock for the layout. */
const FOCUS_UNIFORM_BYTES = 32;

export function createFocusUniformBuffer(
  device: GPUDevice,
  label = 'focus',
): FocusUniformBuffer {
  const buffer = device.createBuffer({
    label: `${label}-focus-uniform`,
    size: FOCUS_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Reusable scratch: f32 for centre/radius/blend/inner. Pad words [6..7] stay zero.
  const scratch = new ArrayBuffer(FOCUS_UNIFORM_BYTES);
  const f32 = new Float32Array(scratch);

  function write(focus: FocusUniformsValue): void {
    f32[0] = focus.center[0];
    f32[1] = focus.center[1];
    f32[2] = focus.center[2];
    f32[3] = focus.apparentRadiusMpc; // vec4 .w (apparent/outer radius)
    f32[4] = focus.blend;
    f32[5] = focus.physicalRadiusMpc; // smoothstep inner edge (core radius)
    device.queue.writeBuffer(buffer, 0, scratch);
  }

  return {
    buffer,
    write,
    destroy(): void {
      buffer.destroy();
    },
  };
}
