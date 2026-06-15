/**
 * youAreHereSubsystem — produces the "YOU ARE HERE" marker label + line
 * for the current frame.  Implements LabelProducer; renderer ownership
 * has moved to labelDirectorSubsystem (which calls produceLabels each
 * frame, merges results from all producers, and flushes once).
 *
 * ### Why the producer pattern?
 *
 * `LabelRenderer.setLabels` and `MarkerLineRenderer.setLines` both REPLACE
 * the full set; for the renderers to host multiple independent overlays
 * (the "you are here" pin, cluster anchors, future void/galaxy labels),
 * someone has to merge the per-frame contributions.  That responsibility
 * lives in `labelDirectorSubsystem`; this file is now just a pure-ish
 * function of camera distance.
 *
 * ### Why the prev-alpha skip is gone
 *
 * The previous implementation cached `prevAlpha` and short-circuited the
 * setLabels/setLines calls when alpha hadn't changed.  The director
 * handles change detection across the merged label set (hashing or
 * deep-compare), so per-producer caching here would be redundant and
 * couple the producer to assumptions about the director's strategy.
 * `produceLabels` is now cheap enough to call every frame.
 */

import type { Label } from '../../../@types/rendering/Label';
import type { MarkerLine } from '../../../@types/rendering/MarkerLine';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { Vec4 } from '../../../@types/math/Vec4';
import type { LabelProducerOutput } from '../../../@types/engine/subsystems/LabelProducerOutput';
import type { YouAreHereSubsystem } from '../../../@types/engine/subsystems/YouAreHereSubsystem';
import { youAreHereAlpha } from '../../gpu/labels/youAreHereVisibility';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';
import { getLabelStyleOverride } from '../labelStyleOverride';

const LABEL_TEXT = 'You are here';
const LABEL_ANCHOR_MPC = 0.05;
const LINE_TOP_MPC = LABEL_ANCHOR_MPC * 0.75;
// LDR display colours.  Marker-lines and labels render in the
// `uiOverlay` pass AFTER the tone-map blit (see
// `services/engine/frame/uiOverlay.ts`), so they composite directly
// onto the swap chain without going through the exposure curve.
// `[1, 1, 1, 1]` is display white at any tone-map setting.
const LABEL_COLOR: Vec4 = [1, 1, 1, 1];
const LINE_COLOR: Vec4 = [1, 1, 1, 1];
// Soft black drop-shadow for legibility against the starfield.
// Re-tune via DebugPanel `LabelEffectsSection`.
const OUTLINE_COLOR: Vec4 = [0, 0, 0, 0.1];
const OUTLINE_EM_FRAC = 0.16;

export function createYouAreHereSubsystem(): YouAreHereSubsystem {
  // One-shot fade-in: the first frame where this producer emits a
  // non-empty label set fires fadeTo(1) on the layer's FadeId.
  // Subsequent frames skip the call (the id already saturates at
  // 1; even cheap idempotency is wasted work). The label renderer
  // doesn't consume this opacity yet (v1) — the registration is
  // structural so a future tour subsystem can dim the layer via
  // state.subsystems.fades.fadeTo without us re-plumbing every
  // producer.
  let didFireFadeIn = false;
  function produceLabels(state: EngineState, ctx: ReadyFrameContext): LabelProducerOutput {
    const camDist = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    const alpha = youAreHereAlpha(camDist);
    if (alpha <= 0) return { labels: [], lines: [], awake: false };
    if (!didFireFadeIn) {
      didFireFadeIn = true;
      void state.subsystems.fades.fadeTo(
        { kind: 'labelLayer', layer: 'youAreHere' },
        1,
        FADE_IN_DURATION_MS,
      );
    }

    // Live-tuning override: when the DebugPanel selects 'youAreHere'
    // as the target category, substitute the override's outline fields
    // for the producer defaults.  Read fresh each frame so panel
    // changes apply on the next render.
    const override = getLabelStyleOverride();
    const effectFields =
      override.targetCategory === 'youAreHere'
        ? {
            outlineColor: override.outlineColor,
            outlineEmFrac: override.outlineEmFrac,
          }
        : {};

    const labels: readonly Label[] = [
      {
        id: 'you-are-here',
        worldPos: [0, LABEL_ANCHOR_MPC, 0],
        text: LABEL_TEXT,
        font: 'cormorant',
        pixelSize: 0, // legacy field — ignored by the new worldEm sizing model
        color: [...LABEL_COLOR],
        worldEmMpc: 0.0125,
        minPixelSize: 45,
        maxPixelSize: 150,
        fadeAlpha: alpha,
        alignX: 'center',
        outlineColor: [...OUTLINE_COLOR],
        outlineEmFrac: OUTLINE_EM_FRAC,
        ...effectFields,
      },
    ];
    const lines: readonly MarkerLine[] = [
      {
        id: 'you-are-here',
        fromWorld: [0, 0, 0],
        toWorld: [0, LINE_TOP_MPC, 0],
        pixelWidth: 3,
        color: [...LINE_COLOR],
        fadeAlpha: alpha,
        // Anchor for the 'you-are-here' label: the director's declutter drops
        // this stem if the label loses an overlap, so it never floats orphaned.
        ownerLabelId: 'you-are-here',
      },
    ];
    // No `awake` signal: alpha is a pure function of camera distance,
    // so any change to it is driven by camera motion, which already
    // wakes the loop via tweens / spaceMouse / pointer events. Returning
    // `awake: alpha < 1` would pin the loop whenever the camera parks
    // inside the 0.6–2.0 Mpc fade band.
    return { labels, lines, awake: false };
  }

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the you-are-here subsystem is
  // one of the engine's ~13 teardown targets, and the shared shape
  // lets engine.destroy() iterate uniformly across the bag.
  const subsystem: YouAreHereSubsystem = {
    id: 'you-are-here',
    produceLabels,
    destroy(): void {
      // Intentionally empty — see the type-level docstring for why.
    },
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
