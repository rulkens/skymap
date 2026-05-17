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

export function createYouAreHereSubsystem(): YouAreHereSubsystem {
  function produceLabels(_state: EngineState, ctx: ReadyFrameContext): LabelProducerOutput {
    const camDist = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    const alpha = youAreHereAlpha(camDist);
    if (alpha <= 0) return { labels: [], lines: [], awake: false };

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
      },
    ];
    return { labels, lines, awake: alpha > 0 && alpha < 1 };
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
