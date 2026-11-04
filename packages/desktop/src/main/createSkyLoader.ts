import type { SkyLoaderDeps } from '../@types/SkyLoaderDeps';

/**
 * Prune, then show the sky; never rejects. A running sync must not meet a prune (the old
 * inventory would delete the files it is downloading), so the load after it prunes instead.
 * A failed load is logged, not thrown: window supervision owns recovery, and a rejection here
 * would otherwise end an unattended kiosk.
 */
export function createSkyLoader(deps: SkyLoaderDeps): () => Promise<void> {
  return async () => {
    try {
      if (!deps.isSyncing()) await deps.prune();
      await deps.show();
    } catch (error) {
      deps.logError('sky load:', error);
    }
  };
}
