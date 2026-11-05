// Byte layout of a per-level archive index (`z<N>.idx`); the spec's
// "The archive format" tables are the contract. Little-endian throughout.
export const SURFACE_TILE_ARCHIVE_MAGIC = 'STAI';
export const SURFACE_TILE_ARCHIVE_VERSION = 1;
export const SURFACE_TILE_ARCHIVE_HEADER_BYTES = 16;
export const SURFACE_TILE_ARCHIVE_ENTRY_BYTES = 16;
export const SURFACE_TILE_ARCHIVE_MAX_PART_BYTES = 64 * 1024 * 1024;
export const SURFACE_TILE_ARCHIVE_MAX_LEVEL = 23; // 6 B key: 2·23 bits
