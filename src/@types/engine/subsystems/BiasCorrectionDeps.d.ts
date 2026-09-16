import type { BiasMode } from '../../data/galaxyCatalog/BiasMode';
import type { GalaxyCatalog } from '../../data/galaxyCatalog/GalaxyCatalog';
import type { SourceType } from '../../data/SourceType';
import type { GalaxyPointRenderer } from '../../rendering/GalaxyPointRenderer';
import type { SchechterRunner } from './SchechterRunner';
import type { AngularRunner } from './AngularRunner';

export type BiasCorrectionDeps = {
  /**
   * The renderer whose per-source vertex buffers every bake splices into. A
   * CONSTRUCTOR dep, not a later attach: the Layer's `create` builds the
   * renderer first, so there is no pre-attach window to cache results across.
   */
  renderer: GalaxyPointRenderer;

  /**
   * Current bias mode — read lazily on every bake decision, because the user
   * can flip modes between bakes.
   */
  getMode: () => BiasMode;

  /**
   * Currently-loaded source catalogs, keyed by Source enum. Read
   * lazily because the catalog map is mutated in place across tier
   * swaps and per-source uploads. Reads the live `galaxyStore` map.
   */
  getLoadedClouds: () => ReadonlyMap<SourceType, GalaxyCatalog>;

  /**
   * Wake the render loop. Called after every bake completes (the
   * uploaded splice changes what the visual pass renders, so the
   * shader needs another frame). Replaces the old
   * `getState().subsystems.scheduler.requestRender()` reach-in.
   */
  requestRender: () => void;

  /** Optional override for the Schechter-ratio bake (test-injected). */
  schechterRunner?: SchechterRunner;

  /** Optional override for the angular-weight bake (test-injected). */
  angularRunner?: AngularRunner;
};
