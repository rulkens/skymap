/**
 * points.bin byte-layout constants — shared by the offline packer (Node)
 * and the browser parser so the two sides can never drift out of sync.
 * Header: magic(4) + formatVersion u32(4) + pointCount u32(4) + reserved(4).
 * Record: x,y,z f32(12) + r,g,b u8(3) + classification u8(1), stride 16.
 */
export const POINTS_MAGIC = 'PTS3';
export const POINTS_FORMAT_VERSION = 1;
export const POINTS_HEADER_BYTES = 16;
export const POINTS_RECORD_BYTES = 16;
