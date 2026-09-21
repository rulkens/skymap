/**
 * Galaxy thumbnails default ON — the close-up DSS / SDSS quad textures are
 * the visual payoff of zooming in on a galaxy. Off mode is mostly a
 * debug/perf escape hatch.
 */

import type { ThumbnailsSettings } from '../../../../@types/settings/ThumbnailsSettings';

export const initialState: ThumbnailsSettings = {
  enabled: true,
};
