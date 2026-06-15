/**
 * produceMilkyWayLabel — per-frame "You are here" label + marker-line stem for
 * the Milky Way, read from `settings.milkyWay.labelEnabled` and the camera
 * distance.
 *
 * This is a BARE function (not a subsystem) registered with the
 * `labelDirector` via an inline `{ id, produceLabels }` wrapper in `engine.ts`,
 * mirroring `produceStructureLabels` / `produceFamousLabels`. There is no
 * mutable subsystem state to own and nothing to tear down — the only state is
 * the module-level load-in latch below.
 *
 * ### Why the load-in latch lives at module scope
 *
 * As a bare function the producer has nowhere to keep a once-per-session
 * one-shot except module scope. The first frame this label is INTENDED-VISIBLE
 * (`labelEnabled` true) AND actually emits, it fires its `fadeTo(1)` once.
 * Because it is a single label (not a per-category family) the latch is a plain
 * boolean — the structure producer needs a `Set<Category>` for its many
 * categories; here one boolean is the essential single-vs-many difference.
 *
 * ### Why the distance fade stays a producer concern
 *
 * The Milky Way label fades with camera distance (full ≤ 0.6 Mpc, gone ≥
 * 2 Mpc) — a pure function of where the camera is, not a layer-machinery
 * concept. Keeping `milkyWayLabelAlpha` here and multiplying it by the layer
 * opacity (`fadeAlpha = distAlpha × layerOpacity`) composes the two cleanly
 * without the fade registry learning a Milky-Way special case. The layer
 * opacity carries the user toggle + the load-in ramp; the distance alpha
 * carries the orientation-usefulness gate.
 */

import type { Label } from '../../../@types/rendering/Label';
import type { MarkerLine } from '../../../@types/rendering/MarkerLine';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { LabelProducerOutput } from '../../../@types/engine/subsystems/LabelProducerOutput';
import { MILKY_WAY_LABEL_STYLE } from './milkyWayLabelStyle';
import { milkyWayLabelAlpha } from '../../gpu/labels/milkyWayLabelVisibility';
import { getLabelStyleOverride } from '../labelStyleOverride';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';

// Origin anchor + stem geometry. The label floats just above the Milky Way
// dot; the stem runs from the origin up to 3/4 of the label anchor height so
// it visually connects the dot to the centred text. This is anchor geometry
// (where the label sits), not style (how it looks) — so it stays in the
// producer rather than the style module.
const LABEL_ANCHOR_MPC = 0.05;
const LINE_TOP_MPC = LABEL_ANCHOR_MPC * 0.75;

const LABEL_TEXT = 'You are here';

const LAYER_ID = { kind: 'labelLayer', layer: 'milkyWay' } as const;

// Module-scope load-in latch — see the module header. Fires `fadeTo(1)` once
// on the first INTENDED-VISIBLE emit. Reset between tests via
// `__resetMilkyWayLabelLoadIn`.
let loadInFired = false;

/** Test-only: clear the module-level load-in latch between unit cases. */
export function __resetMilkyWayLabelLoadIn(): void {
  loadInFired = false;
}

export function produceMilkyWayLabel(
  state: EngineState,
  ctx: ReadyFrameContext,
): LabelProducerOutput {
  const fades = state.subsystems.fades;
  const now = performance.now();

  const layerOpacity = fades.opacityOf(LAYER_ID, now);
  const labelEnabled = state.settings.milkyWay.labelEnabled;

  // All-or-nothing skip: a label that is both DISABLED and fully faded out
  // contributes nothing. A still-fading disabled label (opacity > 0) keeps
  // emitting so its fade-out tail draws to completion — same gate the
  // structure producer uses.
  if (!labelEnabled && layerOpacity === 0) return { labels: [], lines: [], awake: false };

  const camDist = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  const distAlpha = milkyWayLabelAlpha(camDist);
  // Far away: emit nothing this frame. The load-in latch must NOT fire here —
  // it fires only on an actual intended-visible emit, so a far camera on the
  // first frame doesn't burn the one-shot before the label is ever seen.
  if (distAlpha <= 0) return { labels: [], lines: [], awake: false };

  // Load-in: fire the layer's fade-in once on the first intended-visible emit.
  // Gated on `labelEnabled` (not merely on reaching this line): a disabled
  // label fading OUT still passes the draw gate above, and an ungated fire
  // would re-ramp it to 1 mid-fade.
  if (labelEnabled && !loadInFired) {
    loadInFired = true;
    void fades.fadeTo(LAYER_ID, 1, FADE_IN_DURATION_MS);
  }

  // The distance fade composes with the layer opacity (user toggle + load-in
  // ramp). Applied to BOTH the label and the stem so they fade in lock-step.
  const fadeAlpha = distAlpha * layerOpacity;

  // Live-tuning override: when the DebugPanel targets the milkyWay category,
  // substitute the override's outline fields for the producer defaults. Read
  // fresh each frame so panel edits apply on the next render.
  const override = getLabelStyleOverride();
  const overrideFields =
    override.targetCategory === 'milkyWay'
      ? { outlineColor: override.outlineColor, outlineEmFrac: override.outlineEmFrac }
      : {};

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
      ...overrideFields,
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
  // tweens / spaceMouse / pointer events. Returning `awake: alpha < 1` would
  // pin the loop whenever the camera parks inside the 0.6–2.0 Mpc fade band.
  return { labels, lines, awake: false };
}
