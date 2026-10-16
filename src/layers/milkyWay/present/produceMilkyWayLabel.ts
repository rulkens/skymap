/**
 * produceMilkyWayLabel — the per-frame "You are here" label + stem, registered
 * on the COSMO slab's director via the Layer's `guides.screenLabels`.
 *
 * The two distance bands stay here — pure functions of where the camera is — and
 * multiply into the label value core hands (toggle, fade and clip), so core never
 * learns a Milky-Way special case: that value carries the user toggle, the distance
 * alphas the orientation-usefulness gate.
 */

import type { Label2D } from '../../../@types/rendering/Label2D';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { FadeBand } from '../../../@types/math/FadeBand';
import type { LayerScreenLabel } from '../../../@types/engine/layer/LayerScreenLabel';
import { MILKY_WAY_PICK_ID } from './milkyWayPickId';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { MILKY_WAY_LABEL_STYLE } from './milkyWayLabelStyle';
import { liftedLabelPlacement } from '../../../services/engine/presentation/liftedLabelPlacement';
import { textLayoutOf } from '../../../services/gpu/labelLayout/textLayoutOf';
import { fadeBand } from '../../../utils/math/fadeBand';
import { isPickableUnderFocus } from '../../../utils/structure/isPickableUnderFocus';
import { SCALE_FADE_BANDS } from '../../../services/engine/presentation/scaleFadeBands';

// The MW stellar disk, in kpc: the origin dot has no catalog row to read a
// diameter from, so the producer supplies one for the proportional lift.
const MILKY_WAY_DIAMETER_KPC = 30;

// Far fade: full inside the Local Group (<0.6 Mpc), gone once large-scale
// structure fills the view (>2 Mpc) — a label there would be visual noise.
// A recede fade (`fullAt < goneAt`): fades OUT as distance RISES.
const MILKY_WAY_LABEL_FADE_BAND: FadeBand = { fullAt: 0.6, goneAt: 2.0 };

const LABEL_TEXT = 'You are here';

export const produceMilkyWayLabel: LayerScreenLabel<'milkyWay'>['produceLabels'] = (
  state,
  ctx,
  fade,
) => {
  if (state.settings.labels.focusedOnly && state.selection.focus?.type !== 'milkyWay')
    return { labels: [], awake: false };

  const camDist = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  const distAlpha = fadeBand(MILKY_WAY_LABEL_FADE_BAND, camDist);
  // Near-side cull. This annotation is COSMO-slab content anchored at the world
  // origin, and once the camera descends inside COSMO_NEAR_MPC (0.01 Mpc) the
  // origin no longer projects validly: the stem's endpoints land at a degenerate
  // clip-w and blow up into a screen-filling quad, and the non-empty line set
  // keeps the whole 'marker-lines' pass running every frame to draw it. The
  // impostor could move to NEAR0; this origin-anchored label cannot, so it rides
  // the shallower survey band instead (gone by 2 kpc, well clear of the blowup).
  const deepZoomFade = fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDist);
  if (distAlpha <= 0 || deepZoomFade <= 0) return { labels: [], awake: false };

  // Applied to BOTH the label and the stem so they fade in lock-step.
  const fadeAlpha = distAlpha * deepZoomFade * fade;

  const style = MILKY_WAY_LABEL_STYLE;

  // Built BEFORE its geometry so `measure` reads the same font / text / alignment
  // the final label carries; `worldPos` is provisional until the lift below.
  const label: Label2D = {
    id: 'milkyWay',
    // Exactly what `milkyWayPickRenderer` stamps. The impostor picks on NEAR0
    // while this label picks on COSMO; both decode to `{ type: 'milkyWay' }`.
    pickId: isPickableUnderFocus([0, 0, 0], ctx.snapshot.focus) ? MILKY_WAY_PICK_ID : undefined,
    subjectId: MILKY_WAY_PICK_ID,
    worldPos: [0, 0, 0],
    text: LABEL_TEXT,
    font: 'cormorant',
    pixelSize: 0, // legacy field — ignored by the worldEm sizing model
    color: [...style.labelColor],
    worldEmMpc: style.worldEmMpc,
    minPixelSize: style.minPixelSize,
    maxPixelSize: style.maxPixelSize,
    fadeAlpha,
    alignX: 'center',
    outlineColor: [...style.outlineColor],
    outlineEmFrac: style.outlineEmFrac,
    // The orientation anchor always wins the director's declutter. MAX_VALUE, not
    // Infinity: the comparator subtracts, and Infinity − Infinity is NaN, which
    // would corrupt the sort the moment a second always-wins label appeared.
    prominencePx: Number.MAX_VALUE,
  };

  // Endpoints are re-derived from the camera every frame — safe only because the
  // cosmoLabelDirector's re-upload signature keys on the label's `leader.toWorld`.
  const sizePx = apparentSizePx({
    diameterKpc: MILKY_WAY_DIAMETER_KPC,
    distanceMpc: camDist,
    pxPerRad: ctx.drawPxPerRad,
  });
  const viewportPx: Vec2 = [ctx.canvasSize.width, ctx.canvasSize.height];
  const fontAtlases = state.gpu.fontAtlases;
  const placement = liftedLabelPlacement({
    anchorWorldPos: [0, 0, 0],
    vp: ctx.vp,
    viewportPx,
    pxPerRad: ctx.drawPxPerRad,
    subjectSizePx: sizePx,
    textBbox: fontAtlases ? textLayoutOf(fontAtlases.metricsByFont, label).bbox : null,
    worldEmMpc: style.worldEmMpc,
    minPixelSize: style.minPixelSize,
    maxPixelSize: style.maxPixelSize,
  });
  // Origin behind the camera: the projection is undefined — emit nothing.
  if (placement === null) return { labels: [], awake: false };

  const labels: readonly Label2D[] = [
    {
      ...label,
      worldPos: placement.labelWorldPos,
      ...(placement.line !== null && {
        leader: {
          fromWorld: placement.line.fromWorld,
          toWorld: placement.line.toWorld,
          pixelWidth: style.pixelWidth,
          color: [...style.lineColor],
        },
      }),
    },
  ];

  // Never `awake`: alpha is a pure function of camera distance, and camera motion
  // already wakes the loop. `awake: alpha < 1` would instead pin the loop for as
  // long as the camera parked inside the 0.6–2.0 Mpc fade band.
  return { labels, awake: false };
};
