/**
 * starCatalogLayout — the ONE TS home of the `StarUniforms` @group(0) scalar
 * offsets, shared by the visual `starCatalogRenderer` and its pick twin. The
 * WESL struct in `shaders/starCatalog/io.wesl` is what the GPU addresses by.
 *
 * @module
 */

import { CAMERA_UNIFORM_BYTES } from '../../../services/gpu/lib/cameraUniforms';
import { roundUpToMultiple } from '../../../utils/math/roundUpToMultiple';

/**
 * Byte size of the star `StarUniforms` @group(0) buffer: the shared
 * `CameraUniforms` prefix + `sizePx` f32 + `brightness` f32 + `glowOverlap` f32
 * + `pickPass` u32 + `aggregateIntensityCap` f32 + `pxPerRad` f32, rounded up
 * to the prefix's 16-byte alignment = 112 (mirrors `struct StarUniforms` in
 * shaders/starCatalog/io.wesl). The first four appended scalars fill one 16-byte
 * tail (80 + 16 → 96); the last two open a second, so 8 bytes at 104..111 are
 * pad and the buffer rounds to 112. Derived from
 * `CAMERA_UNIFORM_BYTES` so the prefix size stays single-sourced, the way the
 * galaxy points `Uniforms` struct appends its own scalars.
 */
export const STAR_UNIFORM_BYTES = roundUpToMultiple(CAMERA_UNIFORM_BYTES + 24, 16);

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
 * Float index of `pxPerRad` in the `StarUniforms` scratch: byte 100 / 4 = 25 —
 * the drawn target's pixels per radian, which `toRefPx` normalises glow radii
 * by. The pick renderer leaves it zero-init: its fragment ignores intensity.
 */
export const PX_PER_RAD_FLOAT_INDEX = (CAMERA_UNIFORM_BYTES + 20) / 4;
