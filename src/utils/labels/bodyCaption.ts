/**
 * bodyCaption — the shared `ForegroundCaption` builder for a seeded scene
 * body: position, tint, kind and pick id are the caller's own; font, outline,
 * size clamps and alignment are authored once here. Both `sceneBodyLabels`
 * (core) and `produceStarCaptions` (the star Layer) call this rather than
 * growing their own copy, so a caption reads the same regardless of producer.
 */

import type { Label2D } from '../../@types/rendering/Label2D';
import type { Vec3 } from '../../@types/math/Vec3';
import type { SceneBody } from '../../@types/scene/SceneBody';
import type { CaptionKind } from '../../services/engine/presentation/captionPriority';
import type { ForegroundCaption } from '../../services/engine/presentation/foregroundCaption';
import { RENDER_ORIGIN_MPC } from '../../data/renderOrigin';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { FAMOUS_LABEL_STYLE } from '../../services/engine/presentation/famousLabelStyle';
import { sceneBodyPickId } from '../picking/sceneBodyPickId';
import { bodyFootprintRadiusM } from '../scene/bodyFootprintRadiusM';

/**
 * Vertical stagger so captions of bodies sharing a sub-pixel screen spot
 * don't overlap (Sun+Earth are 1 AU apart, Earth+Moon 384,400 km — both
 * collapse to a dot at most zooms). Everything else defaults to baseline.
 */
const BODY_ALIGN_Y: Readonly<Record<string, Label2D['alignY']>> = {
  sun: 'top',
  earth: 'bottom',
  moon: 'top',
};

/**
 * `position`/`tint` are parameters because no `SceneBody` arm carries either
 * (each seed table derives its own colour). `pickId` defaults through the
 * shared body-pick registry; a star's caller packs its own (source + seed
 * index) instead, since only it knows which seed table it walked.
 */
export function bodyCaption(
  body: SceneBody,
  positionMpc: Readonly<Vec3>,
  tint: Readonly<Vec3>,
  kind: CaptionKind,
  pickId: number | undefined = sceneBodyPickId(body.id) ?? undefined,
): ForegroundCaption {
  const o = RENDER_ORIGIN_MPC;
  const p = positionMpc;
  const worldPos: Vec3 = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  // Lets clicking the NAME select the subject, the affordance a sub-pixel
  // glint footprint can only approximate; an unseeded id stays out of the
  // pick set (the −1 contract) rather than aliasing body 0.
  return {
    id: `sceneBody-${body.id}`,
    kind,
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
    worldEmMpc: bodyFootprintRadiusM(body) * SCALE_UNITS.M_TO_MPC,
    minPixelSize: FAMOUS_LABEL_STYLE.minPixelSize,
    maxPixelSize: FAMOUS_LABEL_STYLE.maxPixelSize,
    alignX: 'center',
    alignY: BODY_ALIGN_Y[body.id] ?? 'baseline',
  };
}
