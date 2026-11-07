import type { SkyLoaderDeps } from './@types/SkyLoaderDeps';
import { SKY_RETRY_MS } from './data/skyRetryMs';

/**
 * Prune, then show the sky; never rejects, since a rejection would end an unattended kiosk. A
 * failed load is logged and tried once more after a pause: nothing crashed, so window supervision
 * would leave the window black. A second failure waits for Restart sky.
 */
export function createSkyLoader(deps: SkyLoaderDeps): () => Promise<void> {
  const attempt = async (): Promise<void> => {
    await deps.prune();
    await deps.show();
  };
  return async () => {
    try {
      await attempt();
    } catch (error) {
      deps.logError('sky load:', error);
      await new Promise((resolve) => setTimeout(resolve, SKY_RETRY_MS));
      await attempt().catch((again: unknown) => deps.logError('sky load, retried:', again));
    }
  };
}
