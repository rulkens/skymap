/**
 * cropMath — pure helpers for the 1:1-locked crop rectangle.
 *
 * Coordinates are source-image pixels.  The React component handles the
 * canvas↔image transform.
 *
 * Square invariant: every resize op snaps width === height.
 *
 * Bounds: the rect may extend OUTSIDE the image (corners can be negative
 * or exceed `bounds`).  The only invariant is that the crop's CENTER
 * stays inside the image, so the user can always grab the rect to drag
 * it back.  Out-of-image regions land as transparent pixels in the
 * server-side rotate-then-extract step.
 *
 * Rotation: `rotationDeg` rotates the rect around its center.  All
 * resize/translate helpers operate in the rect's LOCAL frame — the
 * caller is responsible for rotating screen-space deltas by
 * `-rotationDeg` (via `rotateDelta`) before passing them in.
 */

export type Crop = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
};
export type Bounds = { width: number; height: number };

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Clamp the crop's center to inside `bounds`, preserving width/height
 * and rotation.  The rect's corners may end up outside the image.
 */
function clampCenter(c: Crop, b: Bounds): Crop {
  const cx = clamp(c.x + c.width / 2, 0, b.width);
  const cy = clamp(c.y + c.height / 2, 0, b.height);
  return {
    x: cx - c.width / 2,
    y: cy - c.height / 2,
    width: c.width,
    height: c.height,
    rotationDeg: c.rotationDeg,
  };
}

/**
 * Rotate a 2D delta by `angleDeg` (positive = counter-clockwise in math
 * convention; for screen-space drags use the negative of the crop's
 * rotation to go from screen-frame to local-frame).
 */
export function rotateDelta(dx: number, dy: number, angleDeg: number): { dx: number; dy: number } {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { dx: dx * cos - dy * sin, dy: dx * sin + dy * cos };
}

export function resetCrop(b: Bounds): Crop {
  // Biggest possible square = the shorter axis of the image, centred on
  // the longer axis.  Defaulting to the image edges signals "edit me".
  const size = Math.floor(Math.min(b.width, b.height));
  return {
    x: Math.floor((b.width - size) / 2),
    y: Math.floor((b.height - size) / 2),
    width: size,
    height: size,
    rotationDeg: 0,
  };
}

export function translateCrop(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  return clampCenter(
    { x: c.x + dx, y: c.y + dy, width: c.width, height: c.height, rotationDeg: c.rotationDeg },
    b,
  );
}

/**
 * Set the crop's rotation in degrees.  Wrapped into [-180, 180) for a
 * stable round-trip across drag sessions.
 */
export function setRotation(c: Crop, rotationDeg: number): Crop {
  // Normalise to (-180, 180].  Avoids unbounded growth across repeated drags.
  const wrapped = ((rotationDeg + 180) % 360 + 360) % 360 - 180;
  return { ...c, rotationDeg: wrapped };
}

/**
 * Snap (dx, dy) → a single magnitude that keeps the rect square.
 * The sign comes from the caller (the direction the side actually moves
 * outward in this corner's frame of reference).
 */
function squareDelta(dx: number, dy: number): number {
  return Math.max(Math.abs(dx), Math.abs(dy));
}

export function resizeCornerSE(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  // Anchor NW = (c.x, c.y).  Side grows when dx > 0 OR dy > 0.
  const sign = dx + dy >= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const size = Math.max(1, c.width + sign * mag);
  return clampCenter({ x: c.x, y: c.y, width: size, height: size, rotationDeg: c.rotationDeg }, b);
}

export function resizeCornerNW(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  // Anchor SE = (c.x + c.width, c.y + c.height).  Side grows when dx<0 or dy<0.
  const seX = c.x + c.width;
  const seY = c.y + c.height;
  const sign = dx + dy <= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const size = Math.max(1, c.width + sign * mag);
  return clampCenter({ x: seX - size, y: seY - size, width: size, height: size, rotationDeg: c.rotationDeg }, b);
}

export function resizeCornerNE(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  // Anchor SW = (c.x, c.y + c.height).  Side grows when dx>0 or dy<0.
  const swX = c.x;
  const swY = c.y + c.height;
  const sign = dx - dy >= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const size = Math.max(1, c.width + sign * mag);
  return clampCenter({ x: swX, y: swY - size, width: size, height: size, rotationDeg: c.rotationDeg }, b);
}

export function resizeCornerSW(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  // Anchor NE = (c.x + c.width, c.y).  Side grows when dx<0 or dy>0.
  const neX = c.x + c.width;
  const neY = c.y;
  const sign = -dx + dy >= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const size = Math.max(1, c.width + sign * mag);
  return clampCenter({ x: neX - size, y: neY, width: size, height: size, rotationDeg: c.rotationDeg }, b);
}

/**
 * Edge resize: the dragged edge moves by the delta; the perpendicular
 * axis grows by the same amount but is recentred (split half above /
 * half below the original mid-axis) so the rect stays square.
 */
function edgeResult(
  newSize: number,
  fixedEdgeAxis: 'x' | 'y',
  fixedEdgeStart: number,
  originalMidPerp: number,
  rotationDeg: number,
  b: Bounds,
): Crop {
  const size = Math.max(1, newSize);
  if (fixedEdgeAxis === 'x') {
    const x = fixedEdgeStart;
    const y = originalMidPerp - size / 2;
    return clampCenter({ x, y, width: size, height: size, rotationDeg }, b);
  }
  const y = fixedEdgeStart;
  const x = originalMidPerp - size / 2;
  return clampCenter({ x, y, width: size, height: size, rotationDeg }, b);
}

export function resizeEdgeE(c: Crop, dx: number, b: Bounds): Crop {
  const newSize = c.width + dx;
  const fixedEdgeX = c.x;
  const midY = c.y + c.height / 2;
  return edgeResult(newSize, 'x', fixedEdgeX, midY, c.rotationDeg, b);
}

export function resizeEdgeW(c: Crop, dx: number, b: Bounds): Crop {
  const newSize = c.width - dx;
  const fixedEdgeX = c.x + c.width - Math.max(1, newSize);
  const midY = c.y + c.height / 2;
  return edgeResult(newSize, 'x', fixedEdgeX, midY, c.rotationDeg, b);
}

export function resizeEdgeN(c: Crop, dy: number, b: Bounds): Crop {
  const newSize = c.height - dy;
  const fixedEdgeY = c.y + c.height - Math.max(1, newSize);
  const midX = c.x + c.width / 2;
  return edgeResult(newSize, 'y', fixedEdgeY, midX, c.rotationDeg, b);
}

export function resizeEdgeS(c: Crop, dy: number, b: Bounds): Crop {
  const newSize = c.height + dy;
  const fixedEdgeY = c.y;
  const midX = c.x + c.width / 2;
  return edgeResult(newSize, 'y', fixedEdgeY, midX, c.rotationDeg, b);
}
