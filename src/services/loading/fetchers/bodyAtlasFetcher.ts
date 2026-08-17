/**
 * bodyAtlasFetcher — `Fetcher<ImageBitmap, void>` for the one all-bodies surface
 * atlas (`body-atlas.webp`, 2048x1024, ~180 KB). The request is `void` because
 * nothing varies: the build emits no per-tier atlas variants. The filename comes
 * from the generated layout module the emitter writes in the same run as the atlas
 * itself, so URL and file cannot drift apart; a hand-copied literal degrades into a
 * silent 404 neither a test nor the compiler can see. The decode is the DEFAULT
 * managed one — every atlased tile is an sRGB `surface` map, so `bodyTextureFetcher`'s
 * `colorSpaceConversion: 'none'` branch (numeric normal/material channels) is dead here.
 */

import type { Fetcher } from '../../../@types/loading/Fetcher';
import { BODY_ATLAS_FILENAME } from '../../../data/bodies/bodyAtlas.generated';
import { dataUrl } from '../fetchWithProgress';

export const bodyAtlasFetcher: Fetcher<ImageBitmap, void> = async (_req, signal) => {
  const url = dataUrl(`images/textures/${BODY_ATLAS_FILENAME}`);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`bodyAtlas: HTTP ${res.status} for ${url}`);
  const blob = await res.blob();
  return createImageBitmap(blob);
};
