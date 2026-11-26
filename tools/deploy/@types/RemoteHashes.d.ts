/**
 * What one `rclone lsjson --hash` listing says about the keys it was asked for:
 * a key absent from the map is not on R2; a present key maps to its MD5, or to
 * null when R2 has none to give (a multipart upload's ETag is not an MD5).
 */
export type RemoteHashes = ReadonlyMap<string, string | null>;
