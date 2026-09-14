/**
 * points.bin byte-layout constants — shared by the offline packer (Node)
 * and the browser parser so the two sides can never drift out of sync.
 */
export const POINTS_MAGIC = 'PTS3';
export const POINTS_FORMAT_VERSION = 1;
export const POINTS_HEADER_BYTES = 16;
export const POINTS_RECORD_BYTES = 16;
