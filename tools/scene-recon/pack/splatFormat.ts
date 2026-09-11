/**
 * splats.bin byte-layout constants — shared by the offline packer (Node)
 * and the browser parser so the two sides can never drift out of sync.
 */
export const SPLATS_MAGIC = 'SPL3';
export const SPLATS_FORMAT_VERSION = 1;
export const SPLATS_HEADER_BYTES = 16;
export const SPLATS_RECORD_BYTES = 28;
export const SPLATS_SH1_RECORD_BYTES = 12;
