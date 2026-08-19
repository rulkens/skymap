/**
 * dummyFade — the inert 16-byte FadeUniforms buffer + bind group that a
 * pick-only pipeline binds at `@group(1)` so its layout stays compatible
 * with the fade-declaring shaders it shares a bind-group layout with.
 *
 * ## Why pick pipelines need a fade group they never read
 *
 * The visible renderers (points, the Milky Way star pass, structure marker
 * rings) declare `@group(1) FadeUniforms` in their vertex shaders and drive
 * a per-frame `fade.opacity`.  Their pick counterparts share the SAME vertex
 * shader — and therefore the same pipeline-layout slot for `@group(1)` — even
 * though the pick fragment never reads fade.  WebGPU still requires a
 * layout-compatible bind group at every declared group index before a draw,
 * so each picker binds this zeroed stand-in: same `FadeUniformsBgl`, a buffer
 * of the right size, contents that don't matter because nothing samples them.
 *
 * ## Why UNIFORM-only, no COPY_DST
 *
 * The buffer is never written after creation — the default-zero contents are
 * exactly what we want (a fade the shader ignores anyway).  Omitting
 * `COPY_DST` states that intent in the usage flags: this is a write-once,
 * read-in-shader-never constant, not a per-frame scratch.  `size: 16` matches
 * the fade uniform's own 16-byte footprint (a single f32 opacity padded to a
 * 16-byte alignment) so the group is byte-for-byte layout-compatible with the
 * real fade group the shared shader expects.
 *
 * ## Why one helper instead of three inline copies
 *
 * `galaxyPickRenderer`, `milkyWayPickRenderer`, and `structureMarkerRenderer` each
 * carried a byte-identical create-buffer + create-bind-group pair.  Three
 * copies of the same size/usage/binding quartet are three chances for a
 * silent drift — bump the size on one and only that picker's group stops
 * matching the shared BGL.  Owning the pair here single-sources the inert
 * group, the same way `lib/cameraUniforms.ts` single-sources the camera
 * prefix.  Allocation stays the caller's to own: the returned `buffer` is
 * destroyed by each picker's own `destroy()`.
 *
 * (This file exports one function — the one-symbol-per-file rule is a
 * `utils/` and `@types/` rule; the gpu-wide shared-primitives `lib/` (a
 * sibling to `renderers/` and `passes/`) groups one domain's primitives,
 * like `lib/blendStates.ts` groups the two shared blend algebras.)
 *
 * @module
 */

import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';

/**
 * Allocate the zeroed 16-byte fade buffer + its bind group against `fadeBgl`
 * at `binding: 0`.  `label` prefixes both resource labels
 * (`${label}-fade-dummy` for the buffer, `${label}-fade-bg-dummy` for the
 * group).  Returns both so the caller can `destroy()` the buffer in its
 * teardown; the bind group is GC'd with it.
 */
export function createDummyFadeBindGroup(
  device: GPUDevice,
  fadeBgl: FadeUniformsBgl,
  label: string,
): { buffer: GPUBuffer; bindGroup: GPUBindGroup } {
  const buffer = device.createBuffer({
    label: `${label}-fade-dummy`,
    size: 16,
    usage: GPUBufferUsage.UNIFORM,
  });
  const bindGroup = device.createBindGroup({
    label: `${label}-fade-bg-dummy`,
    layout: fadeBgl,
    entries: [{ binding: 0, resource: { buffer } }],
  });
  return { buffer, bindGroup };
}
