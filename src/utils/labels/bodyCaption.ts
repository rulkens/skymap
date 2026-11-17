/**
 * bodyCaption — the shared `ForegroundCaption` builder for a seeded scene
 * subject: position, size, tint, priority and pick id are the caller's own; font,
 * outline, size clamps and alignment are authored once here. Only the missions' craft
 * captions still use it; the record path's `caption` style replaces it (slice 10c).
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { ForegroundCaption } from '../../services/engine/presentation/foregroundCaption';
import { RENDER_ORIGIN_MPC } from '../../data/renderOrigin';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { FAMOUS_LABEL_STYLE } from '../../services/engine/presentation/famousLabelStyle';

/**
 * `position`/`tint` are parameters because no `SceneBody` arm carries either
 * (each seed table derives its own colour); `footprintRadiusM` sizes the em,
 * and is a parameter so a subject with no body record (a black hole) can
 * caption. `pickId` is the caller's: only it knows which seed table it walked and
 * which pick code its Layer holds.
 */
export function bodyCaption(
  body: { readonly id: string; readonly label: string },
  footprintRadiusM: number,
  positionMpc: Readonly<Vec3>,
  tint: Readonly<Vec3>,
  priority: number,
  pickId: number | undefined,
): ForegroundCaption {
  const o = RENDER_ORIGIN_MPC;
  const p = positionMpc;
  const worldPos: Vec3 = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  // Lets clicking the NAME select the subject, the affordance a sub-pixel
  // glint footprint can only approximate; an unseeded id stays out of the
  // pick set (the −1 contract) rather than aliasing body 0.
  return {
    id: `sceneBody-${body.id}`,
    priority,
    worldPos,
    pickId,
    text: body.label,
    font: 'cormorant',
    pixelSize: 0,
    color: [tint[0], tint[1], tint[2], 1],
    outlineColor: [0, 0, 0, 0.1],
    outlineEmFrac: 0.16,
    // Clamp band BORROWED from `FAMOUS_LABEL_STYLE` (not a private pair) so a
    // scene-body caption matches a nearby famous-galaxy label's size, and a
    // future retune of the famous band carries here automatically.
    worldEmMpc: footprintRadiusM * SCALE_UNITS.M_TO_MPC,
    minPixelSize: FAMOUS_LABEL_STYLE.minPixelSize,
    maxPixelSize: FAMOUS_LABEL_STYLE.maxPixelSize,
    alignX: 'center',
    alignY: 'baseline',
  };
}
