/**
 * createFocusUniformBuffer — allocate the single engine-owned cluster-focus
 * uniform (buffer + bind group + scratch packer). One structure is focused at a
 * time, so one instance lives on `state.gpu.focusUniform`; `renderFrame`
 * writes it once per frame and every focus-aware pipeline (points, the
 * impostor disks, and the pick pass) binds its bind group.
 *
 * ## Why the bind group also references the lensing buffer
 *
 * The @group(3) layout (see `createFocusUniformsBgl`) co-hosts the shared
 * gravitational-lensing buffer at binding 1, because the points + pick
 * pipelines have no free 5th bind group for it. The two concerns stay
 * independent in data — separate buffers, separate packers, separate
 * per-frame `write` calls — and only this GPU bind-group object composes
 * them, forced by the 4-group cap. `renderFrame` writes the focus buffer
 * here and the lensing buffer via its own factory; this group just binds
 * both. The caller passes the engine-owned lensing buffer in.
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

import type { FocusUniformsBgl } from '../../../@types/rendering/FocusUniformsBgl';
import type { FocusUniformsValue } from '../../../@types/rendering/FocusUniformsValue';
import type { FocusUniformBuffer } from '../../../@types/rendering/FocusUniformBuffer';

/** Byte size of the FocusUniforms block — see the module docblock for the layout. */
const FOCUS_UNIFORM_BYTES = 32;

export function createFocusUniformBuffer(
  device: GPUDevice,
  focusBgl: FocusUniformsBgl,
  // The engine's shared gravitational-lensing buffer — co-bound at
  // @group(3) @binding(1) of this group (see the module docblock + the BGL
  // for why lensing rides the focus group). This factory never writes it;
  // it only references it so the points + pick vertex stages can read the
  // lens array. Allocated by createLensingUniformBuffer before this runs.
  lensingBuffer: GPUBuffer,
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
    entries: [
      { binding: 0, resource: { buffer } },
      // binding 1: the shared lensing buffer (engine-owned, written once
      // per frame by createLensingUniformBuffer's write(), not here).
      { binding: 1, resource: { buffer: lensingBuffer } },
    ],
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
    bindGroup,
    write,
    destroy(): void {
      buffer.destroy();
    },
  };
}
