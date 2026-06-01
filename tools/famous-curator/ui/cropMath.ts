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
 *
 * Aspect-locked family: the deproject crop is NOT square — it frames a
 * disk whose intrinsic shape is an ellipse with axis ratio b/a.  The
 * `*Aspect*` helpers and `seedDeprojectCrop` below preserve
 * `height = width * aspect` where `aspect = height/width = b/a`, instead
 * of the square `width === height`.  They are a SEPARATE family from the
 * square helpers rather than a parameterised generalisation: the square
 * path is load-bearing for as-shot mode with its own per-handle sign
 * logic, so keeping it byte-for-byte untouched avoids silent drift.
 * Each aspect helper mirrors the matching square helper's anchor + sign
 * convention exactly, only swapping the square snap for the aspect one.
 */

import type { Vec2 } from '../../../src/@types/math/Vec2';

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
  const wrapped = ((((rotationDeg + 180) % 360) + 360) % 360) - 180;
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
  return clampCenter(
    { x: seX - size, y: seY - size, width: size, height: size, rotationDeg: c.rotationDeg },
    b,
  );
}

export function resizeCornerNE(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  // Anchor SW = (c.x, c.y + c.height).  Side grows when dx>0 or dy<0.
  const swX = c.x;
  const swY = c.y + c.height;
  const sign = dx - dy >= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const size = Math.max(1, c.width + sign * mag);
  return clampCenter(
    { x: swX, y: swY - size, width: size, height: size, rotationDeg: c.rotationDeg },
    b,
  );
}

export function resizeCornerSW(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  // Anchor NE = (c.x + c.width, c.y).  Side grows when dx<0 or dy>0.
  const neX = c.x + c.width;
  const neY = c.y;
  const sign = -dx + dy >= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const size = Math.max(1, c.width + sign * mag);
  return clampCenter(
    { x: neX - size, y: neY, width: size, height: size, rotationDeg: c.rotationDeg },
    b,
  );
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

// ── Aspect-locked family (deproject crop) ──────────────────────────────
//
// aspect = height/width = b/a.  Each corner helper drives WIDTH from the
// drag exactly as its square sibling drives `size`, then derives HEIGHT
// from aspect.  Each edge helper sets the axis the dragged edge owns and
// follows the perpendicular axis from aspect, recentred like edgeResult.

/** Height from width under the aspect lock, floored at 1 px. */
function heightFromWidth(width: number, aspect: number): number {
  return Math.max(1, Math.round(width * aspect));
}

/** Width from height under the aspect lock, floored at 1 px. */
function widthFromHeight(height: number, aspect: number): number {
  // aspect = height/width ⇒ width = height/aspect.  Guard a zero/NaN
  // aspect by falling back to the height (square) rather than dividing
  // by zero — callers always pass a positive b/a, this is belt-and-braces.
  return Math.max(1, Math.round(aspect > 0 ? height / aspect : height));
}

export function resizeCornerAspectSE(
  c: Crop,
  dx: number,
  dy: number,
  aspect: number,
  b: Bounds,
): Crop {
  // Anchor NW = (c.x, c.y).  Width grows when dx > 0 OR dy > 0.
  const sign = dx + dy >= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const width = Math.max(1, c.width + sign * mag);
  const height = heightFromWidth(width, aspect);
  return clampCenter({ x: c.x, y: c.y, width, height, rotationDeg: c.rotationDeg }, b);
}

export function resizeCornerAspectNW(
  c: Crop,
  dx: number,
  dy: number,
  aspect: number,
  b: Bounds,
): Crop {
  // Anchor SE = (c.x + c.width, c.y + c.height).  Width grows when dx<0 or dy<0.
  const seX = c.x + c.width;
  const seY = c.y + c.height;
  const sign = dx + dy <= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const width = Math.max(1, c.width + sign * mag);
  const height = heightFromWidth(width, aspect);
  return clampCenter(
    { x: seX - width, y: seY - height, width, height, rotationDeg: c.rotationDeg },
    b,
  );
}

export function resizeCornerAspectNE(
  c: Crop,
  dx: number,
  dy: number,
  aspect: number,
  b: Bounds,
): Crop {
  // Anchor SW = (c.x, c.y + c.height).  Width grows when dx>0 or dy<0.
  const swX = c.x;
  const swY = c.y + c.height;
  const sign = dx - dy >= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const width = Math.max(1, c.width + sign * mag);
  const height = heightFromWidth(width, aspect);
  return clampCenter({ x: swX, y: swY - height, width, height, rotationDeg: c.rotationDeg }, b);
}

export function resizeCornerAspectSW(
  c: Crop,
  dx: number,
  dy: number,
  aspect: number,
  b: Bounds,
): Crop {
  // Anchor NE = (c.x + c.width, c.y).  Width grows when dx<0 or dy>0.
  const neX = c.x + c.width;
  const neY = c.y;
  const sign = -dx + dy >= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const width = Math.max(1, c.width + sign * mag);
  const height = heightFromWidth(width, aspect);
  return clampCenter({ x: neX - width, y: neY, width, height, rotationDeg: c.rotationDeg }, b);
}

/**
 * Edge resize under the aspect lock.  The dragged edge sets the new
 * width (E/W) or height (N/S); the perpendicular axis follows from
 * aspect and the rect is recentred on the perpendicular mid-axis, exactly
 * as `edgeResult` does for the square case.
 */
function edgeResultAspect(
  driveAxis: 'width' | 'height',
  driveSize: number,
  aspect: number,
  fixedEdgeAxis: 'x' | 'y',
  fixedEdgeStart: number,
  originalMidPerp: number,
  rotationDeg: number,
  b: Bounds,
): Crop {
  const width =
    driveAxis === 'width'
      ? Math.max(1, driveSize)
      : widthFromHeight(Math.max(1, driveSize), aspect);
  const height =
    driveAxis === 'height'
      ? Math.max(1, driveSize)
      : heightFromWidth(Math.max(1, driveSize), aspect);
  if (fixedEdgeAxis === 'x') {
    const x = fixedEdgeStart;
    const y = originalMidPerp - height / 2;
    return clampCenter({ x, y, width, height, rotationDeg }, b);
  }
  const y = fixedEdgeStart;
  const x = originalMidPerp - width / 2;
  return clampCenter({ x, y, width, height, rotationDeg }, b);
}

export function resizeEdgeAspectE(c: Crop, dx: number, aspect: number, b: Bounds): Crop {
  const newWidth = c.width + dx;
  const fixedEdgeX = c.x;
  const midY = c.y + c.height / 2;
  return edgeResultAspect('width', newWidth, aspect, 'x', fixedEdgeX, midY, c.rotationDeg, b);
}

export function resizeEdgeAspectW(c: Crop, dx: number, aspect: number, b: Bounds): Crop {
  const newWidth = c.width - dx;
  const fixedEdgeX = c.x + c.width - Math.max(1, newWidth);
  const midY = c.y + c.height / 2;
  return edgeResultAspect('width', newWidth, aspect, 'x', fixedEdgeX, midY, c.rotationDeg, b);
}

export function resizeEdgeAspectN(c: Crop, dy: number, aspect: number, b: Bounds): Crop {
  const newHeight = c.height - dy;
  const fixedEdgeY = c.y + c.height - Math.max(1, newHeight);
  const midX = c.x + c.width / 2;
  return edgeResultAspect('height', newHeight, aspect, 'y', fixedEdgeY, midX, c.rotationDeg, b);
}

export function resizeEdgeAspectS(c: Crop, dy: number, aspect: number, b: Bounds): Crop {
  const newHeight = c.height + dy;
  const fixedEdgeY = c.y;
  const midX = c.x + c.width / 2;
  return edgeResultAspect('height', newHeight, aspect, 'y', fixedEdgeY, midX, c.rotationDeg, b);
}

/**
 * Seed a deproject crop framing a disk.  Width spans the disk diameter
 * plus a fractional margin on each side (`2·radiusPx·(1 + margin)`),
 * height follows the aspect lock, the rect is centred on `centerPx`, and
 * `rotationDeg` is set to the disk's position angle so the crop's local
 * axes align with the ellipse's major/minor axes.  The centre is clamped
 * into bounds (corners may exit), matching the resize invariant.
 */
export function seedDeprojectCrop(
  centerPx: Vec2,
  radiusPx: number,
  paDeg: number,
  aspect: number,
  margin: number,
  b: Bounds,
): Crop {
  const width = 2 * radiusPx * (1 + margin);
  const height = width * aspect;
  return clampCenter(
    {
      x: centerPx[0] - width / 2,
      y: centerPx[1] - height / 2,
      width,
      height,
      rotationDeg: paDeg,
    },
    b,
  );
}
