/**
 * produceMilkyWayLabel — per-frame "You are here" label + marker-line stem for
 * the Milky Way, read from `settings.milkyWay.labelEnabled` and the camera
 * distance.
 *
 * This is a BARE function (not a subsystem) registered with the
 * `labelDirector` via an inline `{ id, produceLabels }` wrapper in `engine.ts`,
 * mirroring `produceStructureLabels` / `produceFamousLabels`. There is no
 * mutable subsystem state to own and nothing to tear down.
 *
 * ### Pure reader of the layer opacity
 *
 * The producer only READS `fades.opacityOf(LAYER_ID)` — the visibility bridge
 * (`syncVisibilityFades`) is the sole writer of the layer's intent opacity,
 * seeding and ramping it from `settings.milkyWay.labelEnabled`. The producer
 * never drives a fade of its own.
 *
 * ### Why the distance fade stays a producer concern
 *
 * The Milky Way label fades with camera distance (full ≤ 0.6 Mpc, gone ≥
 * 2 Mpc) — a pure function of where the camera is, not a layer-machinery
 * concept. Keeping `milkyWayLabelAlpha` here and multiplying it by the layer
 * opacity (`fadeAlpha = distAlpha × layerOpacity`) composes the two cleanly
 * without the fade registry learning a Milky-Way special case. The layer
 * opacity carries the user toggle; the distance alpha carries the
 * orientation-usefulness gate.
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

/**
 * Physical diameter driving the label's proportional screen-space lift. The
 * Milky Way dot at the origin has no catalog row to read a diameter from, so
 * the producer supplies the MW stellar disk's ~30 kpc directly — giving the
 * "You are here" caption the exact same treatment as a famous-galaxy label
 * (`liftedLabelPlacement`: proportional lift, stem top derived from the
 * measured text bottom): the caption rides higher the larger "here" looms on
 * screen, instead of the retired fixed world +Y anchor that foreshortened or
 * fell over the text whenever world +Y didn't project to screen-up.
 */
const MILKY_WAY_DIAMETER_KPC = 30;

const LABEL_TEXT = 'You are here';

const LAYER_ID = { kind: 'labelLayer', layer: 'milkyWay' } as const;

export function produceMilkyWayLabel(
  state: EngineState,
  ctx: ReadyFrameContext,
): LabelProducerOutput {
  const fades = state.subsystems.fades;
  const now = ctx.nowMs;

  const layerOpacity = fades.opacityOf(LAYER_ID, now);
  const labelEnabled = state.settings.milkyWay.labelEnabled;

  // All-or-nothing skip: a label that is both DISABLED and fully faded out
  // contributes nothing. A still-fading disabled label (opacity > 0) keeps
  // emitting so its fade-out tail draws to completion — same gate the
  // structure producer uses.
  if (!labelEnabled && layerOpacity === 0) return { labels: [], lines: [], awake: false };

  // focusedOnly mode: this label only draws while the Milky Way is the
  // focused subject — same hard suppression the other producers apply.
  if (state.settings.labels.focusedOnly && state.selection.focus?.type !== 'milkyWay')
    return { labels: [], lines: [], awake: false };

  const camDist = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  const distAlpha = milkyWayLabelAlpha(camDist);
  // Far away: emit nothing this frame.
  if (distAlpha <= 0) return { labels: [], lines: [], awake: false };

  // The distance fade composes with the layer opacity (the user toggle, driven
  // by the visibility bridge). Applied to BOTH the label and the stem so they
  // fade in lock-step.
  const fadeAlpha = distAlpha * layerOpacity;

  const style = MILKY_WAY_LABEL_STYLE;

  // Build the label BEFORE its geometry so `measure` reads the same font /
  // text / alignment fields the final label carries. `worldPos` here is
  // provisional (the origin dot); the emission below replaces it with the
  // lifted anchor.
  const label: Label = {
    // id = the source id ('milkyWay'); only the rendered TEXT stays
    // 'You are here'.
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
    // "You are here" is the orientation anchor: whenever it is visible
    // (camera inside the distance band), overlapping structure labels
    // yield to it in the director's declutter, never the reverse.
    // Number.MAX_VALUE sorts above any finite apparent size while
    // keeping the comparator's subtraction finite (Infinity − Infinity
    // is NaN, which would corrupt the sort if a second always-wins
    // label ever appeared).
    prominencePx: Number.MAX_VALUE,
  };

  // Single derivation chain (see `liftedLabelPlacement`), same as the famous
  // producer: screen-space proportional lift, stem top derived from the
  // measured text bottom minus the shared padding, stem omitted when no room
  // remains. Endpoints are camera-derived per frame — safe because the
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
            // Anchor for the 'milkyWay' label: the director's declutter drops
            // this stem if the label loses an overlap, so it never floats
            // orphaned.
            ownerLabelId: 'milkyWay',
          },
        ]
      : [];

  // No `awake` signal: alpha is a pure function of camera distance, so any
  // change to it is driven by camera motion, which already wakes the loop via
  // tweens / pointer events. Returning `awake: alpha < 1` would
  // pin the loop whenever the camera parks inside the 0.6–2.0 Mpc fade band.
  return { labels, lines, awake: false };
}
