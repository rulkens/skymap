/**
 * dilateMaskDisc — binary dilation of a 0/1 mask by a disc of `radiusPx`.
 * Pixels outside the plane count as 0, so content at the edge is clipped:
 * pad the mask first when the grown shape must stay whole.
 */
export function dilateMaskDisc(
  mask: Uint8Array,
  width: number,
  height: number,
  radiusPx: number,
): Uint8Array {
  const r = Math.floor(radiusPx);
  const offsets: [number, number][] = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= radiusPx * radiusPx) offsets.push([dx, dy]);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (const [dx, dy] of offsets) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < width && yy < height) out[yy * width + xx] = 1;
      }
    }
  }
  return out;
}
