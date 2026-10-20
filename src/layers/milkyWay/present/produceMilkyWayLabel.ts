/**
 * produceMilkyWayLabel — the per-frame "You are here" label + stem, registered
 * on the COSMO slab's director via the Layer's `guides.screenLabels`.
 *
 * Core hands the label value (toggle, fade, clip and the `youAreHere` distance band, which
 * also keeps this producer from being called where the origin cannot project), so core
 * never learns a Milky-Way special case.
 */

import type { Label2D } from '../../../@types/rendering/Label2D';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { LayerScreenLabel } from '../../../@types/engine/layer/LayerScreenLabel';
import { MILKY_WAY_PICK_ID } from './milkyWayPickId';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { MILKY_WAY_LABEL_STYLE } from './milkyWayLabelStyle';
import { liftedLabelPlacement } from '../../../services/engine/presentation/liftedLabelPlacement';
import { textLayoutOf } from '../../../services/gpu/labelLayout/textLayoutOf';
import { isPickableUnderFocus } from '../../../utils/structure/isPickableUnderFocus';

// The MW stellar disk, in kpc: the origin dot has no catalog row to read a
// diameter from, so the producer supplies one for the proportional lift.
const MILKY_WAY_DIAMETER_KPC = 30;

const LABEL_TEXT = 'You are here';

export const produceMilkyWayLabel: LayerScreenLabel<'milkyWay'>['produceLabels'] = (
  state,
  ctx,
  fade,
) => {
  if (state.settings.labels.focusedOnly && state.selection.focus?.type !== 'milkyWay')
    return { labels: [], awake: false };

  const camDist = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
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
    fadeAlpha: fade,
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
  // long as the camera parked inside the 0.6–2.0 Mpc band.
  return { labels, awake: false };
};
