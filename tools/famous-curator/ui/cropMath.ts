/**
 * cropMath — pure helpers for the 1:1-locked crop rectangle.
 *
 * Everything in source-image pixel space.  The React component
 * translates mouse events to pixel deltas via the canvas↔image
 * transform and calls these helpers.
 *
 * The "stay square" invariant is enforced by every operation:
 *   - Reset: width = height = 0.8 * min(bounds).
 *   - Translate: preserves width/height; clamps x,y.
 *   - Corner resize: snaps to max(|dx|, |dy|) so dragging diagonally
 *     follows the dominant axis; the opposite corner is the anchor.
 *   - Edge resize: drags one edge; the perpendicular axis grows in
 *     sync and is recentred so the rect stays square.
 *
 * All helpers clamp the output to `bounds`.
 */

export type Crop = { x: number; y: number; width: number; height: number };
export type Bounds = { width: number; height: number };

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function resetCrop(b: Bounds): Crop {
  // Biggest possible square = the shorter axis of the image, centred on
  // the longer axis.  Maintainers can always shrink the crop afterwards;
  // having the default *touch* the image edges signals "edit me" more
  // clearly than starting with arbitrary padding.
  const size = Math.floor(Math.min(b.width, b.height));
  return {
    x: Math.floor((b.width - size) / 2),
    y: Math.floor((b.height - size) / 2),
    width: size,
    height: size,
  };
}

export function translateCrop(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  return {
    x: clamp(c.x + dx, 0, b.width - c.width),
    y: clamp(c.y + dy, 0, b.height - c.height),
    width: c.width,
    height: c.height,
  };
}

/**
 * Snap (dx, dy) → a single magnitude that keeps the rect square.
 * The sign comes from `sign` (the direction the side actually moves
 * outward in this corner's frame of reference).
 */
function squareDelta(dx: number, dy: number): number {
  // Take the dominant (larger) axis so the rect snaps to a square that
  // keeps up with the faster-moving finger/pointer.  Averaging would
  // lag behind the dominant axis, making the UX feel sticky.
  // Magnitude only; sign decided by caller.
  return Math.max(Math.abs(dx), Math.abs(dy));
}

export function resizeCornerSE(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  // Anchor NW = (c.x, c.y).  Side grows when dx > 0 OR dy > 0.
  const sign = dx + dy >= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const desired = c.width + sign * mag;
  // Clamp size by the remaining room from NW anchor to far edges.
  const maxSize = Math.min(b.width - c.x, b.height - c.y);
  const size = clamp(desired, 1, maxSize);
  return { x: c.x, y: c.y, width: size, height: size };
}

export function resizeCornerNW(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  // Anchor SE = (c.x + c.width, c.y + c.height).  Side grows when dx<0 or dy<0.
  const seX = c.x + c.width;
  const seY = c.y + c.height;
  const sign = dx + dy <= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const desired = c.width + sign * mag;
  const maxSize = Math.min(seX, seY);
  const size = clamp(desired, 1, maxSize);
  return { x: seX - size, y: seY - size, width: size, height: size };
}

export function resizeCornerNE(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  // Anchor SW = (c.x, c.y + c.height).  Side grows when dx>0 or dy<0.
  const swX = c.x;
  const swY = c.y + c.height;
  const sign = dx - dy >= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const desired = c.width + sign * mag;
  const maxSize = Math.min(b.width - swX, swY);
  const size = clamp(desired, 1, maxSize);
  return { x: swX, y: swY - size, width: size, height: size };
}

export function resizeCornerSW(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  // Anchor NE = (c.x + c.width, c.y).  Side grows when dx<0 or dy>0.
  const neX = c.x + c.width;
  const neY = c.y;
  const sign = -dx + dy >= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const desired = c.width + sign * mag;
  const maxSize = Math.min(neX, b.height - neY);
  const size = clamp(desired, 1, maxSize);
  return { x: neX - size, y: neY, width: size, height: size };
}

/**
 * Edge resize: the dragged edge moves by the delta; the perpendicular
 * axis grows by the same amount but is recentred (split half above /
 * half below the original mid-axis) so the rect stays square.
 *
 * Helper that takes (newSize, anchorX, anchorY of the edge that DID NOT
 * move) and recentres the perpendicular axis on the original midpoint.
 */
function edgeResult(
  newSize: number,
  fixedEdgeAxis: 'x' | 'y',
  fixedEdgeStart: number,
  originalMidPerp: number,
  b: Bounds,
): Crop {
  const size = clamp(newSize, 1, fixedEdgeAxis === 'x' ? b.width : b.height);
  if (fixedEdgeAxis === 'x') {
    // Fixed edge is at x = fixedEdgeStart; width grows along x; height
    // also = size, recentred on originalMidPerp (the original mid-Y).
    const x = clamp(fixedEdgeStart, 0, b.width - size);
    const y = clamp(originalMidPerp - size / 2, 0, b.height - size);
    return { x, y, width: size, height: size };
  }
  const y = clamp(fixedEdgeStart, 0, b.height - size);
  const x = clamp(originalMidPerp - size / 2, 0, b.width - size);
  return { x, y, width: size, height: size };
}

export function resizeEdgeE(c: Crop, dx: number, b: Bounds): Crop {
  const newSize = c.width + dx;
  const fixedEdgeX = c.x; // W edge stays put
  const midY = c.y + c.height / 2;
  return edgeResult(newSize, 'x', fixedEdgeX, midY, b);
}

export function resizeEdgeW(c: Crop, dx: number, b: Bounds): Crop {
  // dx < 0 widens.  W edge moves; E edge stays put.
  const newSize = c.width - dx;
  const fixedEdgeX = (c.x + c.width) - clamp(newSize, 1, b.width);
  const midY = c.y + c.height / 2;
  return edgeResult(newSize, 'x', fixedEdgeX, midY, b);
}

export function resizeEdgeN(c: Crop, dy: number, b: Bounds): Crop {
  // dy < 0 widens.  N edge moves; S edge stays put.
  const newSize = c.height - dy;
  const fixedEdgeY = (c.y + c.height) - clamp(newSize, 1, b.height);
  const midX = c.x + c.width / 2;
  return edgeResult(newSize, 'y', fixedEdgeY, midX, b);
}

export function resizeEdgeS(c: Crop, dy: number, b: Bounds): Crop {
  const newSize = c.height + dy;
  const fixedEdgeY = c.y;
  const midX = c.x + c.width / 2;
  return edgeResult(newSize, 'y', fixedEdgeY, midX, b);
}
