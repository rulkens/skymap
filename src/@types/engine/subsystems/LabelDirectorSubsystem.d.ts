import type { LabelRenderer } from '../../rendering/LabelRenderer';
import type { MarkerLineRenderer } from '../../rendering/MarkerLineRenderer';
import type { ReadyFrameContext } from '../frame/ReadyFrameContext';
import type { EngineState } from '../state/EngineState';
import type { Label2DProducer } from './Label2DProducer';

export type LabelDirectorSubsystem = {
  /** Wire in the renderers once initGpu has constructed them. Idempotent. */
  attachRenderers(label: LabelRenderer, line: MarkerLineRenderer): void;
  /** Register a producer.  Order of registration = order of merging. */
  registerProducer(producer: Label2DProducer): void;
  /**
   * Per-frame entry point — poll producers, merge, flush. Returns the wake
   * vote (true while a producer or an appear/disappear envelope is still
   * animating) for the caller to fold into `shouldKeepTicking`; the director
   * never wakes the loop itself.
   */
  runFrame(state: EngineState, ctx: ReadyFrameContext): boolean;
  /**
   * Tear down the director.  No-op — the director holds renderer refs
   * and a producers list, but the renderers' lifecycle is the engine's
   * concern (the engine destroys them separately) and producers
   * unregister implicitly when their owning subsystems are destroyed.
   * Method exists so the engine's bag of subsystems can be torn down
   * uniformly via the shared `Destroyable` shape (`engine.destroy()`
   * iterates and calls `destroy()` on each).
   */
  destroy(): void;
};
