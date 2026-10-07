/**
 * starCatalogLayout — byte-layout contract: the ONE TS home of the
 * `StarUniforms` @group(0) offsets, shared by `starCatalogRenderer` and its pick
 * twin; `struct StarUniforms` in `shaders/starCatalog/io.wesl` is the other half.
 *
 *   byte  0  CameraUniforms prefix (80 B)
 *   byte 80  sizePx f32 · 84 brightness f32 · 88 glowOverlap f32 · 92 pickPass u32
 *   byte 96  aggregateIntensityCap f32 · 100 pxPerRad f32 · 104..111 pad
 *
 * @module
 */

import { CAMERA_UNIFORM_BYTES } from '../../../services/gpu/lib/cameraUniforms';
import { roundUpToMultiple } from '../../../utils/math/roundUpToMultiple';

const WORD_BYTES = 4;
/** Six scalars follow the prefix; the struct rounds up to the prefix's 16-byte alignment. */
export const STAR_UNIFORM_BYTES = roundUpToMultiple(CAMERA_UNIFORM_BYTES + 6 * WORD_BYTES, 16);

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
