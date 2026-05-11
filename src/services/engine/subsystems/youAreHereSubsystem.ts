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

import type { Label } from '../../gpu/renderers/labelRenderer';
import type { MarkerLine } from '../../gpu/renderers/markerLineRenderer';
import type { ReadyFrameContext } from '../frame/frameContext';
import type { Destroyable, EngineState } from '../../../@types';
import type { Vec4 } from '../../../@types/Vec';
import type { LabelProducer, LabelProducerOutput } from './labelProducer';
import { youAreHereAlpha } from '../../gpu/labels/youAreHereVisibility';

const LABEL_TEXT = 'You are here';
const LABEL_ANCHOR_MPC = 0.05;
const LINE_TOP_MPC = LABEL_ANCHOR_MPC * 0.75;
// HDR colours, NOT display colours.  Labels and marker lines render
// into the rgba16float HDR target before the tone-map post-process,
// so anything output at LDR intensity (rgb = 1.0) gets compressed by
// the tonemap curve and reads as mid-grey on screen.  ACES at the
// default exposure compresses 1.0 → ~0.6 display; 8.0 lands at
// roughly display-white after the tonemap rolls off, which is what
// the user expects from a "you are here" pin.  Linear tonemap clamps
// at 1.0 anyway, so the overshoot is harmless on that curve.
//
// The proper fix is to render UI overlays AFTER the tonemap blit
// (separate pipeline targeting the swap-chain format) so they bypass
// the curve entirely; that's a bigger refactor and lives in the
// backlog.  This is the band-aid in the meantime.
const LABEL_COLOR: Vec4 = [8, 8, 8, 1];
const LINE_COLOR: Vec4 = [8, 8, 8, 1];

export type YouAreHereSubsystem = LabelProducer & {
  /**
   * Tear down the subsystem.  No-op — the subsystem owns no closures,
   * listeners, timers, or workers; `produceLabels` is a pure function
   * of `state` + `ctx`.  Method exists so the engine's bag of
   * subsystems can be torn down uniformly via the shared `Destroyable`
   * shape (`engine.destroy()` iterates and calls `destroy()` on each).
   */
  destroy(): void;
};

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
        pixelSize: 18,
        color: [...LABEL_COLOR],
        worldEmMpc: 0.005,
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
