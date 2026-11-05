/**
 * rollEquirectHalfTurn — shift every row of an interleaved equirectangular
 * raster by half its width, wrapping. Re-registers a map whose CENTRE column is
 * longitude 180° (the CICLOPS/Schenk Saturn-moon maps) onto the prime-meridian-
 * centred convention `TEXTURE_PRIME_MERIDIAN_U` assumes; a half turn is its own
 * inverse, so the direction cannot be got wrong.
 */
export function rollEquirectHalfTurn(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): Buffer {
  const out = Buffer.allocUnsafe(data.length);
  const rowBytes = width * channels;
  const halfBytes = Math.floor(width / 2) * channels;
  for (let row = 0; row < height * rowBytes; row += rowBytes) {
    data.copy(out, row, row + halfBytes, row + rowBytes);
    data.copy(out, row + rowBytes - halfBytes, row, row + halfBytes);
  }
  return out;
}
