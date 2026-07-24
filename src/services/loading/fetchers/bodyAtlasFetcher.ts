/**
 * bodyAtlasFetcher — `Fetcher<ImageBitmap, void>` for the one low-resolution
 * all-bodies surface atlas (`body-atlas.webp`, 2048x1024, ~160 KB).
 *
 * The request type is `void`: unlike `bodyTextureFetcher` there is no body, no
 * kind and no tier to vary — the atlas is a single tier-agnostic artefact
 * carrying one 512x256 tile per textured body, and the whole point of the
 * feature is that it is the SAME bytes for every body at every tier. A
 * `{ tier }` request would imply per-tier atlas variants that the build tool
 * does not emit.
 *
 * The filename is authored twice: here, and as `BODY_ATLAS_FILENAME` in
 * `tools/textures/writeBodyAtlas.ts` (the emitter). Sharing one constant across
 * the src/tools boundary was rejected for this task's scope — the twin is one
 * literal in one place each, and a mismatch degrades exactly as a 404 does
 * (below), never as a crash.
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
import { dataUrl } from '../fetchWithProgress';

export const bodyAtlasFetcher: Fetcher<ImageBitmap, void> = async (_req, signal) => {
  const url = dataUrl('images/textures/body-atlas.webp');
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`bodyAtlas: HTTP ${res.status} for ${url}`);
  const blob = await res.blob();
  return createImageBitmap(blob);
};
