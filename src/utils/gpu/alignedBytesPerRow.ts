// `copyTextureToBuffer` requires `bytesPerRow` to be a multiple of 256.
// Computed rather than hard-coded so a grid/texture width that isn't a
// clean multiple doesn't silently corrupt the readback — the caller must
// then strip the row padding back out (copy only the first `rowBytes`
// bytes of each padded row) before the data is otherwise usable.
export function alignedBytesPerRow(rowBytes: number): number {
  return Math.ceil(rowBytes / 256) * 256;
}
