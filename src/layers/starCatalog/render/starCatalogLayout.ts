/**
 * starCatalogLayout — byte-layout contract: the ONE TS home of the
 * `StarUniforms` @group(0) offsets, shared by `starCatalogRenderer` and its pick
 * twin; `struct StarUniforms` in `shaders/starCatalog/io.wesl` is the other half.
 *
 *   byte  0  CameraUniforms prefix (80 B)
 *   byte 80  sizePx f32 · 84 brightness f32 · 88 glowOverlap f32 · 92 pickPass u32
 *   byte 96  aggregateIntensityCap f32 · 100 pxPerRad f32 · 104..111 pad
 *   byte 112 focusCenterRelCam vec3 · 124 focusApparentRadiusMpc f32
 *   byte 128 focusPhysicalRadiusMpc f32 · 132 focusBlend f32 · 136..143 pad
 *
 * @module
 */

import { CAMERA_UNIFORM_BYTES } from '../../../services/gpu/lib/cameraUniforms';
import { roundUpToMultiple } from '../../../utils/math/roundUpToMultiple';
import type { StarFocusSphere } from '../@types/StarFocusSphere';

const WORD_BYTES = 4;
/** Six scalars follow the prefix; the focus sphere's vec3 then aligns to 16. */
const SCALARS_BEFORE_FOCUS = 6;
const FOCUS_CENTER_BYTE_OFFSET = roundUpToMultiple(
  CAMERA_UNIFORM_BYTES + SCALARS_BEFORE_FOCUS * WORD_BYTES,
  16,
);
/** The three f32 after the centre: the first rides the vec3's 4th lane. */
const FOCUS_APPARENT_BYTE_OFFSET = FOCUS_CENTER_BYTE_OFFSET + 3 * WORD_BYTES;
const FOCUS_PHYSICAL_BYTE_OFFSET = FOCUS_APPARENT_BYTE_OFFSET + WORD_BYTES;
const FOCUS_BLEND_BYTE_OFFSET = FOCUS_PHYSICAL_BYTE_OFFSET + WORD_BYTES;
export const STAR_UNIFORM_BYTES = roundUpToMultiple(FOCUS_BLEND_BYTE_OFFSET + WORD_BYTES, 16);

const scalarIndex = (slot: number) => (CAMERA_UNIFORM_BYTES + slot * WORD_BYTES) / WORD_BYTES;

export const SIZE_PX_FLOAT_INDEX = scalarIndex(0);
export const BRIGHTNESS_FLOAT_INDEX = scalarIndex(1);
export const GLOW_OVERLAP_FLOAT_INDEX = scalarIndex(2);
/**
 * Written as a u32, never a float: `1.0`'s bit pattern (0x3F800000) would read
 * back as ~1e9 and silently disable the pick branch. Only the pick renderer
 * writes it; the visual one leaves it zero-init, which selects the visual path.
 */
export const PICK_PASS_U32_INDEX = scalarIndex(3);
/** Written by the visual renderer only; the pick draw is leaf-only and leaves it zero. */
export const AGG_INTENSITY_CAP_FLOAT_INDEX = scalarIndex(4);
/** The drawn target's pixels per radian (`toRefPx`); the pick draw leaves it zero. */
export const PX_PER_RAD_FLOAT_INDEX = scalarIndex(5);

export const FOCUS_CENTER_FLOAT_INDEX = FOCUS_CENTER_BYTE_OFFSET / WORD_BYTES;
export const FOCUS_APPARENT_FLOAT_INDEX = FOCUS_APPARENT_BYTE_OFFSET / WORD_BYTES;
export const FOCUS_PHYSICAL_FLOAT_INDEX = FOCUS_PHYSICAL_BYTE_OFFSET / WORD_BYTES;
export const FOCUS_BLEND_FLOAT_INDEX = FOCUS_BLEND_BYTE_OFFSET / WORD_BYTES;

/**
 * Write the focus sphere into a `StarUniforms` scratch. Both star renderers
 * call it on every draw: the shader's focus smoothstep has no safe zero state
 * (equal radii give NaN), so a scratch that skipped it would not be neutral.
 */
export function writeStarFocus(scratch: Float32Array, focus: StarFocusSphere): void {
  scratch.set(focus.centerRelCamMpc, FOCUS_CENTER_FLOAT_INDEX);
  scratch[FOCUS_APPARENT_FLOAT_INDEX] = focus.apparentRadiusMpc;
  scratch[FOCUS_PHYSICAL_FLOAT_INDEX] = focus.physicalRadiusMpc;
  scratch[FOCUS_BLEND_FLOAT_INDEX] = focus.blend;
}
