/**
 * Splash copy tables.
 */

import type { SplashError } from '../../@types/splash/SplashError';

export const TITLE_ID = 'splash-title';
export const BODY_ID = 'splash-body';
export const BODY_DATA_ID = 'splash-body-data';

// aria-describedby takes an ID *list* — both body paragraphs describe the
// dialog, and reusing one id on both would silently drop the second.
export const DESCRIBED_BY = `${BODY_ID} ${BODY_DATA_ID}`;

// Keyed by SplashError['kind'] — the project's >2-way rule: a Record scales
// to a new error kind by adding a row, not another ternary branch.
export const ERROR_COPY: Record<SplashError['kind'], string> = {
  'webgpu-init-failed':
    'WebGPU failed to initialize on this device. Try reloading, or use a recent version of Chrome or Edge.',
  'catalog-fetch-failed':
    'Failed to load the galaxy data. Check your connection and try reloading.',
  'data-version-mismatch': 'Skymap was updated — reload the page to fetch matching data',
};
