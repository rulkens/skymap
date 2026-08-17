/**
 * bodyAtlasFetcher — `Fetcher<ImageBitmap, void>` for the one low-resolution
 * all-bodies surface atlas (`body-atlas.webp`, 2048x1024, ~180 KB).
 *
 * The request type is `void`: unlike `bodyTextureFetcher` there is no body, no
 * kind and no tier to vary — the atlas is a single tier-agnostic artefact
 * carrying one 512x256 tile per textured body, and the whole point of the
 * feature is that it is the SAME bytes for every body at every tier. A
 * `{ tier }` request would imply per-tier atlas variants that the build tool
 * does not emit.
 *
 * The filename comes from the generated layout module, which the emitter writes
 * in the same run that writes the atlas itself, so the URL and the file on disk
 * cannot drift onto different names — the guarantee `bodyTextureFilename` gives
 * the per-body tiers. A hand-copied literal here would degrade as a silent 404:
 * the atlas never arrives, every body falls back to its grey placeholder, and
 * neither a test nor the compiler can see it. The `images/textures/` prefix is
 * the shared textures directory, spelled as `bodyTextureFetcher` spells it.
 *
 * The decode is the DEFAULT managed one, not `colorSpaceConversion: 'none'`:
 * every tile in the atlas is an sRGB colour map (only `surface` kinds are
 * atlased — no normal or material maps, whose numeric channels a gamma-managed
 * decode would shift). `bodyTextureFetcher` branches on `isLinearTextureKind`
 * for exactly that reason; here the kind is fixed, so the branch would be dead.
 *
 * Posture on failure is silent-optional-asset, the same as `bodyTextureFetcher`:
 * a 404 (an unsynced R2 bucket, say) or a decode failure throws, the error flows
 * to the slot's `error` state, and every body renderer keeps the 1x1 placeholder
 * it drew before this feature existed. Nothing downstream is gated on the atlas.
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
