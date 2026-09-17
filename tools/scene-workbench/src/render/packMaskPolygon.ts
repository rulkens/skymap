import type { Vec2 } from '../../../../src/@types/math/Vec2';

/** `struct MaskPolygon { count: u32, _pad: u32, cornersM: array<vec2f> }` in shaders/texturedMesh/io.wesl. */
const COUNT_OFFSET = 0;
const CORNERS_OFFSET = 8;
const BYTES_PER_CORNER = 8;
const MIN_CORNERS = 3;

/** Fewer than three corners packs `count = 0` (no mask); the buffer keeps one corner slot
 *  even then, because a storage binding of a runtime-sized array needs one element. */
export function packMaskPolygon(ringM: readonly Vec2[] | null): ArrayBuffer {
  const corners = ringM && ringM.length >= MIN_CORNERS ? ringM : [];
  const bytes = new ArrayBuffer(CORNERS_OFFSET + BYTES_PER_CORNER * Math.max(corners.length, 1));
  new DataView(bytes).setUint32(COUNT_OFFSET, corners.length, true);
  const xy = new Float32Array(bytes, CORNERS_OFFSET);
  corners.forEach(([x, y], k) => {
    xy[2 * k] = x;
    xy[2 * k + 1] = y;
  });
  return bytes;
}
