/**
 * bodyCaption — the shared `ForegroundCaption` builder for a seeded scene
 * body. Position, tint, kind and pick id are the caller's (each seed table's
 * own colour derivation and identity); font, outline, size clamps and
 * alignment are authored once here so a caption reads the same regardless of
 * which producer built it — `sceneBodyLabels` (core) and `produceStarCaptions`
 * (the star Layer) both call this rather than growing their own copy.
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
 * Vertical stagger so captions of bodies that share a sub-pixel screen spot
 * don't overlap: the Sun's text hangs below its anchor while Earth's sits
 * above (the pair is 1 AU apart — one dot at most zooms), and the Moon's
 * hangs below so it clears Earth's caption (they sit 384,400 km apart).
 * Everything else is far apart on the sky — default baseline.
 */
const BODY_ALIGN_Y: Readonly<Record<string, Label2D['alignY']>> = {
  sun: 'top',
  earth: 'bottom',
  moon: 'top',
};

/**
 * Build the common label shape for one body. The position is the caller's — no
 * `SceneBody` arm carries one — so this reads it as a parameter. The colour is
 * the caller's per-type derivation (spectral colour / albedo / Earth blue), widened
 * to straight RGBA at full alpha; `kind` is the caller's structural knowledge of
 * which seed table the body came from. A star's caption packs its own identity
 * (source + seed index) because only its caller knows which table it walked;
 * every body id resolves through the shared default.
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
  // The caption carries its subject's pick id so clicking the NAME selects it —
  // the affordance a sub-pixel body's glint footprint can only approximate. An
  // unseeded id (impossible from these seed tables, but the −1 contract is the
  // helper's) stays out of the pick set rather than aliasing body 0.
  return {
    id: `sceneBody-${body.id}`,
    kind,
    worldPos,
    pickId,
    text: body.label,
    font: 'cormorant',
    pixelSize: 0,
    color: [tint[0], tint[1], tint[2], 1],
    // Faint black drop shadow for legibility against space or a bright
    // limb. Matches the shared label convention (10%-alpha, em-frac 0.16);
    // a fully-opaque outline paints a hard black ring, not a shadow.
    outlineColor: [0, 0, 0, 0.1],
    outlineEmFrac: 0.16,
    // Em height tracks the body's true size; the pixel clamps below keep
    // it readable even though that em is microscopic at most zooms. The clamp
    // band is BORROWED from `FAMOUS_LABEL_STYLE` (not a private 13/44 pair) so
    // a scene-body caption reads at the same size as a nearby famous-galaxy
    // label — the "adopt the famous treatment" parity — and a future retune of
    // the famous band carries here automatically instead of silently drifting.
    worldEmMpc: bodyFootprintRadiusM(body) * SCALE_UNITS.M_TO_MPC,
    minPixelSize: FAMOUS_LABEL_STYLE.minPixelSize,
    maxPixelSize: FAMOUS_LABEL_STYLE.maxPixelSize,
    alignX: 'center',
    alignY: BODY_ALIGN_Y[body.id] ?? 'baseline',
  };
}
