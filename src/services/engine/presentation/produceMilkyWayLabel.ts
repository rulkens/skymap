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
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { LabelProducerOutput } from '../../../@types/engine/subsystems/LabelProducerOutput';
import { MILKY_WAY_LABEL_STYLE } from './milkyWayLabelStyle';
import { milkyWayLabelAlpha } from '../../gpu/labels/milkyWayLabelVisibility';

// Origin anchor + stem geometry. The label floats just above the Milky Way
// dot; the stem runs from the origin up to 3/4 of the label anchor height so
// it visually connects the dot to the centred text. This is anchor geometry
// (where the label sits), not style (how it looks) — so it stays in the
// producer rather than the style module.
const LABEL_ANCHOR_MPC = 0.05;
const LINE_TOP_MPC = LABEL_ANCHOR_MPC * 0.75;

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

  const labels: readonly Label[] = [
    {
      // id = the source id ('milkyWay'); only the rendered TEXT stays
      // 'You are here'.
      id: 'milkyWay',
      worldPos: [0, LABEL_ANCHOR_MPC, 0],
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
    },
  ];
  const lines: readonly MarkerLine[] = [
    {
      id: 'milkyWay',
      fromWorld: [0, 0, 0],
      toWorld: [0, LINE_TOP_MPC, 0],
      pixelWidth: style.pixelWidth,
      color: [...style.lineColor],
      fadeAlpha,
      // Anchor for the 'milkyWay' label: the director's declutter drops this
      // stem if the label loses an overlap, so it never floats orphaned.
      ownerLabelId: 'milkyWay',
    },
  ];

  // No `awake` signal: alpha is a pure function of camera distance, so any
  // change to it is driven by camera motion, which already wakes the loop via
  // tweens / pointer events. Returning `awake: alpha < 1` would
  // pin the loop whenever the camera parks inside the 0.6–2.0 Mpc fade band.
  return { labels, lines, awake: false };
}
