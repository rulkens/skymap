// Byte layout of an archive index, shared by the surface tiles (`z<N>.idx`) and the volume
// bricks; the surface-tile archives spec's "The archive format" tables are the contract.
// Little-endian throughout. The magic stays 'STAI': its bytes are on R2.
export const ARCHIVE_MAGIC = 'STAI';
export const ARCHIVE_VERSION = 1;
export const ARCHIVE_HEADER_BYTES = 16;
export const ARCHIVE_ENTRY_BYTES = 16;
export const ARCHIVE_MAX_PART_BYTES = 16 * 1024 * 1024;
