/**
 * labelProducer — type contract for any subsystem that contributes
 * labels and marker lines to the shared label/marker-line renderers.
 *
 * ### Why a shared contract?
 *
 * `LabelRenderer.setLabels` and `MarkerLineRenderer.setLines` both
 * REPLACE the full set on each call; two subsystems calling them
 * directly would stomp each other.  The director pattern
 * (`labelDirectorSubsystem`) merges contributions from multiple
 * producers and flushes once per frame.  Producers don't hold renderer
 * references — they just return what they want to show on the next
 * frame.
 *
 * ### Why `awake`?
 *
 * Render-on-demand is the project's policy.  Some producers
 * (`youAreHereSubsystem`) want the render loop to stay awake while an
 * internal animation is mid-transition.  The director ORs the `awake`
 * flag across producers and calls `scheduler.requestRender()` once if
 * any want a continuation.
 *
 * ### Immutability
 *
 * Outputs are `readonly` arrays; the director MAY shallow-copy them
 * into the renderer's mutable array slot, but the producer treats
 * the returned arrays as frozen.  Each call to `produceLabels` returns
 * a fresh object — no caching, no shared references between frames.
 */

import type { Label } from '../../gpu/renderers/labelRenderer';
import type { MarkerLine } from '../../gpu/renderers/markerLineRenderer';
import type { ReadyFrameContext } from '../frame/frameContext';
import type { EngineState } from '../../../@types';

/** What a single producer wants to render on the next frame. */
export type LabelProducerOutput = {
  readonly labels: readonly Label[];
  readonly lines: readonly MarkerLine[];
  /**
   * If true, the director should request a continuation render this frame
   * (mid-transition animation needs the loop to stay awake).  Defaults
   * to false; producers only opt in when their state is genuinely
   * evolving frame-to-frame.
   */
  readonly awake: boolean;
};

/** A subsystem that contributes label + marker-line content. */
export type LabelProducer = {
  /** Stable identifier — used for debugging and de-duplication. */
  readonly id: string;
  /** Per-frame entry point.  Pure of state; reads `state`, returns fresh output. */
  produceLabels(state: EngineState, ctx: ReadyFrameContext): LabelProducerOutput;
};
