/**
 * starCatalogLayout — the ONE TS home for the survey-star (Gaia bin) pipeline's
 * CPU-side byte-layout knowledge: the `NodeParams` storage-element packing and
 * the `StarUniforms` @group(0) uniform's scalar offsets.
 *
 * ### Why this module exists (the un-braid)
 *
 * The authoritative layout is the WESL `struct NodeParams` / `struct
 * StarUniforms` in `shaders/starCatalog/io.wesl` — that is what the GPU uses to
 * address bytes. Two TS renderers reconstruct those bytes on the CPU: the visual
 * `starCatalogRenderer` and its pick twin `starCatalogPickRenderer`. Each owns
 * its OWN GPU buffers (the essential writeBuffer/submit race fix — a buffer
 * shared across the two draws in one frame would read only the last-written
 * bytes at submit), but *which byte holds which field* is ONE fact. Before this
 * module the two renderers each re-declared the constants and re-wrote the pack
 * loop, so growing a `NodeParams` field meant editing three sites in lockstep
 * with nothing to catch a drift — the exact bug-class `selectionEncoding`'s
 * parity test guards against, applied to the star layout here (see
 * `tests/services/gpu/renderers/starCatalog/nodeParamsLayout.test.ts`).
 *
 * Both renderers now import the constants and `writeStarNodeParams` from here and
 * keep their own buffers; only the layout knowledge is shared.
 *
 * @module
 */

import { CAMERA_UNIFORM_BYTES } from '../../lib/cameraUniforms';

/**
 * Bytes of one `NodeParams` element in the `array<NodeParams>` storage buffer:
 * originRelCamMpc vec3 (0..11) + cellScaleMpc f32 (12..15) + firstRecord u32
 * (16..19) + opacity f32 (20..23) + isAggregate u32 (24..27) + subtreeStarCount
 * f32 (28..31), rounded up to the vec3's 16-byte alignment = 32. Under WGSL
 * std430 (storage) the array stride is that 16-byte-aligned struct size, so the
 * CPU packs draws back-to-back at this stride with no gaps. `isAggregate` and
 * `subtreeStarCount` ride the pad the vec3 alignment already reserved, so adding
 * them did NOT change this size. Mirrors `struct NodeParams` in
 * `shaders/starCatalog/io.wesl`.
 */
export const NODE_PARAMS_BYTES = 32;

/** Bytes of one `prefix` element (a `u32` exclusive instance-start index). */
export const PREFIX_BYTES = 4;

/** Round `value` up to the next multiple of `align` (a power of two). */
function alignUp(value: number, align: number): number {
  return Math.ceil(value / align) * align;
}

/**
 * Byte size of the star `StarUniforms` @group(0) buffer: the shared
 * `CameraUniforms` prefix + `sizePx` f32 + `brightness` f32 + `glowOverlap` f32
 * + `pickPass` u32 + `aggregateIntensityCap` f32, rounded up to the prefix's
 * 16-byte alignment = 112 (mirrors `struct StarUniforms` in
 * shaders/starCatalog/io.wesl). The first four appended scalars fill one 16-byte
 * tail (80 + 16 → 96); `aggregateIntensityCap` opens a second, so 12 bytes at
 * 100..111 are pad and the buffer rounds to 112. Derived from
 * `CAMERA_UNIFORM_BYTES` so the prefix size stays single-sourced, the way the
 * galaxy points `Uniforms` struct appends its own scalars.
 */
export const STAR_UNIFORM_BYTES = alignUp(CAMERA_UNIFORM_BYTES + 20, 16);

/**
 * Float index of `sizePx` in the `StarUniforms` scratch: byte 80 (right after
 * the camera prefix) / 4.
 */
export const SIZE_PX_FLOAT_INDEX = CAMERA_UNIFORM_BYTES / 4;

/**
 * Float index of `brightness` in the `StarUniforms` scratch: byte 84 (right
 * after `sizePx`) / 4.
 */
export const BRIGHTNESS_FLOAT_INDEX = (CAMERA_UNIFORM_BYTES + 4) / 4;

/**
 * Float index of `glowOverlap` in the `StarUniforms` scratch: byte 88 (right
 * after `brightness`) / 4.
 */
export const GLOW_OVERLAP_FLOAT_INDEX = (CAMERA_UNIFORM_BYTES + 8) / 4;

/**
 * u32 index of `pickPass` in the `StarUniforms` scratch: byte 92 / 4 = 23. The
 * visual renderer never writes it (its per-source camera write stops at
 * `glowOverlap`, float 22, and the scratch is zero-init) so the vertex stage
 * reads pickPass == 0 and takes the visual path; only `starCatalogPickRenderer`
 * writes it. It MUST be written as a u32, NOT a float: a `1.0` float bit pattern
 * (0x3F800000) would read back as ~1e9 in the shader's `u32`, silently disabling
 * the pick branch — the value must be the integer 1.
 */
export const PICK_PASS_U32_INDEX = (CAMERA_UNIFORM_BYTES + 12) / 4;

/**
 * Float index of `aggregateIntensityCap` in the `StarUniforms` scratch: byte 96
 * (right after `pickPass`) / 4 = 24. The visual renderer writes it from the
 * user's "Fog cap" setting; the pick renderer leaves it zero-init (it draws
 * leaves only, and the cap clamps aggregate peaks only).
 */
export const AGG_INTENSITY_CAP_FLOAT_INDEX = (CAMERA_UNIFORM_BYTES + 16) / 4;

/**
 * Pack one `NodeParams` block at byte `base` of `view`, in the field order the
 * WESL `struct NodeParams` declares. Both star renderers call this once per
 * drawn node into their OWN contiguous scratch (index = draw slot). The offsets
 * here are the single CPU statement of the layout; a WESL struct change without
 * a matching move here is caught by `nodeParamsLayout.test.ts`.
 *
 * The fields arrive as loose SCALARS (`ox`/`oy`/`oz` for the origin vec3, then
 * the rest) rather than a `StarNodeParams` object on purpose: the callers pull
 * them straight out of the star cut's reused flat typed arrays (indexing
 * `originRelCamMpc[3*i + k]`), so a per-node object literal here would
 * reintroduce exactly the per-drawn-node allocation the flat-array cut exists to
 * kill. The visual renderer sources these from its per-frame draw args; the pick
 * renderer fixes `opacity = 1`, `isAggregate = 0`, `subtreeStarCount = 1`
 * (leaf-only, point-source, and the pick fragment ignores opacity).
 */
export function writeStarNodeParams(
  view: DataView,
  base: number,
  ox: number,
  oy: number,
  oz: number,
  cellScaleMpc: number,
  firstRecord: number,
  opacity: number,
  isAggregate: number,
  subtreeStarCount: number,
): void {
  view.setFloat32(base + 0, ox, true);
  view.setFloat32(base + 4, oy, true);
  view.setFloat32(base + 8, oz, true);
  view.setFloat32(base + 12, cellScaleMpc, true);
  view.setUint32(base + 16, firstRecord >>> 0, true);
  view.setFloat32(base + 20, opacity, true);
  view.setUint32(base + 24, isAggregate >>> 0, true);
  view.setFloat32(base + 28, subtreeStarCount, true);
}
