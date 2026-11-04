import type { SkyLoaderDeps } from './@types/SkyLoaderDeps';

/**
 * Prune, then show the sky; never rejects. A failed load is logged, not thrown: window supervision
 * owns recovery, and a rejection here would otherwise end an unattended kiosk.
 */
export function createSkyLoader(deps: SkyLoaderDeps): () => Promise<void> {
  return async () => {
    try {
      await deps.prune();
      await deps.show();
    } catch (error) {
      deps.logError('sky load:', error);
    }
  };
}
