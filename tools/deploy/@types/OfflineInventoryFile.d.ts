/** `sha256` and `size` are of the local raw bytes: the desktop client decodes wire gzip. */
export type OfflineInventoryFile = { key: string; size: number; sha256: string };
