import type { BiasMode } from '../../data/galaxyCatalog/BiasMode';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { SourceType } from '../../data/SourceType';
import type { GalaxyPointRenderer } from '../../rendering/GalaxyPointRenderer';

export type BiasCorrectionSubsystem = {
  /** Wire the renderer once it exists (during `phases/initGpu`). */
  attachRenderer(renderer: GalaxyPointRenderer): void;
  /** Switch bias mode; fires bakes for every loaded source. */
  setMode(mode: BiasMode): Promise<void>;
  /** Called by the renderer when a source uploads or re-uploads. */
  onSourceUploaded(source: SourceType, cloud: GalaxyCatalog): void;
  /** Called by the renderer when a source unloads. */
  onSourceUnloaded(source: SourceType): void;
  /** Test-only: snapshot of internal state. */
  state(): {
    mode: BiasMode;
    sourcesWithSchechter: SourceType[];
    sourcesWithAngular: SourceType[];
  };
  /**
   * Tear down the subsystem.  Currently a no-op — bias bakes spawn
   * per-call workers that self-terminate (`runDisposableWorker`), and
   * there are no event listeners or persistent subscriptions to
   * release.  The method exists for uniform iteration in
   * `engine.destroy()` (every subsystem satisfies `Destroyable`) and
   * acts as the placeholder for the audit-#2 follow-up: if we later
   * track in-flight bake workers so a teardown mid-bake can abort
   * them, the abort logic lands here without disturbing call sites.
   */
  destroy(): void;
};
