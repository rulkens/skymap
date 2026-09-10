/**
 * splats.bin byte-layout constants — shared by the offline packer (Node)
 * and the browser parser so the two sides can never drift out of sync.
 * The 12-byte SH degree-1 record is a trailing block, never interleaved
 * with the 28-byte core records.
 */
export const SPLATS_MAGIC = 'SPL3';
export const SPLATS_FORMAT_VERSION = 1;
export const SPLATS_HEADER_BYTES = 16;
export const SPLATS_RECORD_BYTES = 28;
export const SPLATS_SH1_RECORD_BYTES = 12;
