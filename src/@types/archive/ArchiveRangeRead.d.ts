/** ArchiveRangeRead — what one Range read of an archive entry found. */
export type ArchiveRangeRead =
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array<ArrayBuffer> }
  /** The server answered 200: it ignored Range. The caller warns once. */
  | { readonly kind: 'no-range' }
  | { readonly kind: 'failed' };
