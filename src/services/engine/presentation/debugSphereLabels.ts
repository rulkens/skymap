/**
 * debugSphereLabels — name labels for the Plan-01 foreground debug spheres.
 *
 * The Sun and Earth render true-scale in the foreground pass, so at almost
 * every zoom level they are sub-pixel and impossible to locate by eye.
 * These labels anchor a name to each body's world position, giving the
 * descent toward the solar system something to aim at.
 *
 * ### Why the foreground projection, not the main one
 *
 * The main camera projection is pinned at near = 0.01 Mpc.  At solar-system
 * zoom the bodies sit ~1e-13 Mpc from the camera — far inside that near
 * plane — so the normal label path (which projects with `ctx.vp`) would
 * clip them away.  `foregroundLabelsPass` instead draws these through
 * `ctx.foregroundVp`, whose near plane is proportional to `cam.distance`
 * and so always contains the bodies.
 *
 * ### Why renderOrigin-relative positions
 *
 * `ctx.foregroundVp` is built relative to `renderOrigin`: every position
 * handed to it must already have the origin subtracted (the same contract
 * `composeBodyMvp` honours for the sphere MVPs).  With `RENDER_ORIGIN_MPC`
 * fixed at the Sun ([0, 0, 0]) the subtraction is numerically a no-op
 * today, but doing it here keeps the labels correct by construction if a
 * future floating origin moves.
 *
 * Plan 02 replaces this with labels sourced from the real BodyStore; this
 * file is deleted then, alongside `debugSphereBody.ts`.
 */

import type { Label } from '../../../@types/rendering/Label';
import type { Vec3 } from '../../../@types/math/Vec3';
import { DEBUG_SPHERE_BODIES } from '../../../data/bodies/debugSphereBody';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';

/** Straight-RGBA tints so the two bodies read apart at a glance. */
const BODY_COLOR: Readonly<Record<string, Label['color']>> = {
  Sun: [1, 0.85, 0.4, 1],
  Earth: [0.5, 0.72, 1, 1],
};

/**
 * Vertical stagger so the two captions don't overlap while the bodies are
 * still sub-pixel apart on screen: Earth's text sits above its anchor, the
 * Sun's hangs below.  As the camera dives in, Earth separates along +X and
 * the stagger stops mattering.
 */
const BODY_ALIGN_Y: Readonly<Record<string, Label['alignY']>> = {
  Sun: 'top',
  Earth: 'bottom',
};

/**
 * Build one name label per debug body, positioned relative to
 * `RENDER_ORIGIN_MPC` for the foreground view-projection.  Static — the
 * bodies don't move — so the caller sets these once at construction.
 */
export function debugSphereLabels(): Label[] {
  const o = RENDER_ORIGIN_MPC;
  return DEBUG_SPHERE_BODIES.map((body) => {
    const p = body.positionMpc;
    const worldPos: Vec3 = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
    return {
      id: `debugSphere-${body.label}`,
      worldPos,
      text: body.label,
      font: 'cormorant',
      pixelSize: 0,
      color: BODY_COLOR[body.label] ?? [1, 1, 1, 1],
      // Faint black drop shadow for legibility against space or a bright
      // limb. Matches the shared label convention (10%-alpha, em-frac 0.16);
      // a fully-opaque outline paints a hard black ring, not a shadow.
      outlineColor: [0, 0, 0, 0.1],
      outlineEmFrac: 0.16,
      // Em height tracks the body's true size; the pixel clamps below keep
      // it readable even though that em is microscopic at most zooms.
      worldEmMpc: body.radiusMpc,
      minPixelSize: 13,
      maxPixelSize: 44,
      alignX: 'center',
      alignY: BODY_ALIGN_Y[body.label] ?? 'baseline',
    };
  });
}
