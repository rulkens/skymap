import type { BiasMode } from '../../data/BiasMode';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { SourceType } from '../../data/Source';
import type { SchechterRunner } from './SchechterRunner';
import type { AngularRunner } from './AngularRunner';

export type BiasCorrectionDeps = {
  /**
   * Current bias mode — read lazily on every bake decision because
   * the user can flip modes between bakes. Replaces the old
   * `getState().settings.bias.mode` read.
   */
  getMode: () => BiasMode;

  /**
   * Currently-loaded source catalogs, keyed by Source enum. Read
   * lazily because the catalog map is mutated in place across tier
   * swaps and per-source uploads. Replaces the old
   * `getState().sources.catalogs` read.
   */
  getLoadedClouds: () => Map<SourceType, GalaxyCatalog>;

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
