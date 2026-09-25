/**
 * rasterizeHoleMask — an R8 hole mask over a ring's own ENU bounding box:
 * 255 where a pixel centre is INSIDE the ring and at least `erodeM` from its
 * boundary, 0 elsewhere. Erosion is exact (distance to the nearest ring
 * edge), not a pixel-grid morphological approximation, so a concave corner
 * shrinks the same as a straight edge. Row 0 is the NORTH edge (max Y) —
 * `buildMeshes` writes the mask so texture v = 0 sits at the hole rect's max
 * latitude, matching how the surface-tile shader will sample it.
 */

/** Even-odd ray-casting point-in-polygon; `ring` is implicitly closed
 *  (last vertex connects back to the first). */
function insideRing(ring: readonly (readonly [number, number])[], px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > py !== yj > py) {
      const xCross = xi + ((py - yi) / (yj - yi)) * (xj - xi);
      if (px < xCross) inside = !inside;
    }
  }
  return inside;
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Distance from (px, py) to the nearest edge of the implicitly-closed ring. */
function distToBoundary(
  ring: readonly (readonly [number, number])[],
  px: number,
  py: number,
): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    best = Math.min(best, distToSegment(px, py, xi, yi, xj, yj));
  }
  return best;
}

export function rasterizeHoleMask(
  ringEnuM: readonly (readonly [number, number])[],
  metresPerPx: number,
  erodeM: number,
): {
  mask: Uint8Array;
  width: number;
  height: number;
  minEnuM: [number, number];
  sizeEnuM: [number, number];
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ringEnuM) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const width = Math.max(1, Math.round((maxX - minX) / metresPerPx));
  const height = Math.max(1, Math.round((maxY - minY) / metresPerPx));

  const mask = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    const y = maxY - (row + 0.5) * metresPerPx;
    for (let col = 0; col < width; col++) {
      const x = minX + (col + 0.5) * metresPerPx;
      if (!insideRing(ringEnuM, x, y)) continue;
      if (erodeM > 0 && distToBoundary(ringEnuM, x, y) < erodeM) continue;
      mask[row * width + col] = 255;
    }
  }
  return { mask, width, height, minEnuM: [minX, minY], sizeEnuM: [maxX - minX, maxY - minY] };
}
