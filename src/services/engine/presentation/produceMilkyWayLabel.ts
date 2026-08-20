/**
 * produceMilkyWayLabel — the per-frame "You are here" label + stem, a bare
 * function registered with the `labelDirector` in `engine.ts`.
 *
 * It only READS `fades.opacityOf(LAYER_ID)`; `syncVisibilityFades` is the sole
 * writer of that intent opacity. The two distance bands stay here — pure functions
 * of where the camera is — and multiply into the resolved layer opacity, so the
 * registry never learns a Milky-Way special case: layer opacity carries the user
 * toggle, the distance alphas the orientation-usefulness gate.
 */

import type { Label } from '../../../@types/rendering/Label';
import type { MarkerLine } from '../../../@types/rendering/MarkerLine';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { LabelProducerOutput } from '../../../@types/engine/subsystems/LabelProducerOutput';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { MILKY_WAY_LABEL_STYLE } from './milkyWayLabelStyle';
import { liftedLabelPlacement } from './liftedLabelPlacement';
import { milkyWayLabelAlpha } from '../../gpu/labelLayout/milkyWayLabelVisibility';
import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from './scaleFadeBands';
import { resolveLayerOpacity } from './focusRecession';

// The MW stellar disk, in kpc: the origin dot has no catalog row to read a
// diameter from, so the producer supplies one for the proportional lift.
const MILKY_WAY_DIAMETER_KPC = 30;

const LABEL_TEXT = 'You are here';

const LAYER_ID = { kind: 'labelLayer', layer: 'milkyWay' } as const;

export function produceMilkyWayLabel(
  state: EngineState,
  ctx: ReadyFrameContext,
): LabelProducerOutput {
  const fades = state.subsystems.fades;
  const now = ctx.nowMs;

  // Two reads of the same row, answering different questions: the RAW intent
  // opacity decides whether the producer emits at all, so a clip fade to 0 cannot
  // truncate a disabled label's fade-out tail; the RESOLVED opacity is what draws.
  const intentOpacity = fades.opacityOf(LAYER_ID, now);
  const labelEnabled = state.settings.milkyWay.labelEnabled;

  // A still-fading disabled label keeps emitting so its fade-out tail completes.
  if (!labelEnabled && intentOpacity === 0) return { labels: [], lines: [], awake: false };

  if (state.settings.labels.focusedOnly && state.selection.focus?.type !== 'milkyWay')
    return { labels: [], lines: [], awake: false };

  const camDist = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  const distAlpha = milkyWayLabelAlpha(camDist);
  // Near-side cull. This annotation is COSMO-slab content anchored at the world
  // origin, and once the camera descends inside COSMO_NEAR_MPC (0.01 Mpc) the
  // origin no longer projects validly: the stem's endpoints land at a degenerate
  // clip-w and blow up into a screen-filling quad, and the non-empty line set
  // keeps the whole 'marker-lines' pass running every frame to draw it. The
  // impostor could move to NEAR0; this origin-anchored label cannot, so it rides
  // the shallower survey band instead (gone by 2 kpc, well clear of the blowup).
  const deepZoomFade = fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDist);
  if (distAlpha <= 0 || deepZoomFade <= 0) return { labels: [], lines: [], awake: false };

  // Applied to BOTH the label and the stem so they fade in lock-step.
  const fadeAlpha = distAlpha * deepZoomFade * resolveLayerOpacity(state, ctx, LAYER_ID);

  const style = MILKY_WAY_LABEL_STYLE;

  // Built BEFORE its geometry so `measure` reads the same font / text / alignment
  // the final label carries; `worldPos` is provisional until the lift below.
  const label: Label = {
    id: 'milkyWay',
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
  // labelDirector's re-upload signature keys on each line's `toWorld`.
  const sizePx = apparentSizePx({
    diameterKpc: MILKY_WAY_DIAMETER_KPC,
    distanceMpc: camDist,
    viewportHeightPx: ctx.canvasSize.height,
    fovYRad: ctx.fovYRad,
  });
  const viewportPx: Vec2 = [ctx.canvasSize.width, ctx.canvasSize.height];
  const placement = liftedLabelPlacement({
    anchorWorldPos: [0, 0, 0],
    vp: ctx.vp,
    viewportPx,
    subjectSizePx: sizePx,
    textBbox: state.gpu.labelRenderer?.measure(label) ?? null,
    worldEmMpc: style.worldEmMpc,
    minPixelSize: style.minPixelSize,
    maxPixelSize: style.maxPixelSize,
  });
  // Origin behind the camera: the projection is undefined — emit nothing.
  if (placement === null) return { labels: [], lines: [], awake: false };

  const labels: readonly Label[] = [{ ...label, worldPos: placement.labelWorldPos }];
  const lines: readonly MarkerLine[] =
    placement.line !== null
      ? [
          {
            id: 'milkyWay',
            fromWorld: placement.line.fromWorld,
            toWorld: placement.line.toWorld,
            pixelWidth: style.pixelWidth,
            color: [...style.lineColor],
            fadeAlpha,
            // The director drops this stem when its label loses an overlap, so it
            // can never float orphaned.
            ownerLabelId: 'milkyWay',
          },
        ]
      : [];

  // Never `awake`: alpha is a pure function of camera distance, and camera motion
  // already wakes the loop. `awake: alpha < 1` would instead pin the loop for as
  // long as the camera parked inside the 0.6–2.0 Mpc fade band.
  return { labels, lines, awake: false };
}
