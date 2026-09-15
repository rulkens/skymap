/**
 * galaxyAtlasSubsystem — the galaxy thumbnail atlas.
 *
 * Configures the generic `tileStreamSubsystem` with the galaxy thumbnail
 * atlas's geometry, pixel format and bitmap upload/release: this is the
 * only galaxy-specific knowledge in the LOD-2 atlas path, everything else
 * (LRU clock, fetch queue, failure memoisation, eviction hook) lives in
 * `tileStreamSubsystem`, which has no notion of what it's streaming.
 */

import { createTileStreamSubsystem } from './tileStreamSubsystem';
import type { TileStreamSubsystem } from '../../../@types/engine/subsystems/TileStreamSubsystem';
import { uploadBitmapToAtlas } from '../../../utils/gpu/uploadBitmapToAtlas';
import { closeBitmap } from '../../../utils/gpu/closeBitmap';

// Geometry of the galaxy thumbnail atlas: a single 2048×2048 texture
// sliced into a 16×16 grid of 128×128 slots (256 thumbnails total).
// `GALAXY_ATLAS_SLOT_SIDE` is exported because the bitmap fetcher
// (fetchGalaxyBitmap) resizes network images to exactly this size during
// decode, so the two must stay in lockstep.
const GALAXY_ATLAS_SIDE = 2048;
export const GALAXY_ATLAS_SLOT_SIDE = 128;
const GALAXY_ATLAS_FORMAT: GPUTextureFormat = 'rgba8unorm-srgb';

export type GalaxyAtlasDeps = {
  readonly device: GPUDevice;
  /**
   * Wake the engine's render loop for the next frame.  Called when a
   * fetch completes (so the thumbnail can render) and when a fetch
   * fails (so the still-animating predicate re-checks `inFlightCount`).
   */
  readonly requestRender: () => void;
};

export function createGalaxyAtlasSubsystem(
  deps: GalaxyAtlasDeps,
): TileStreamSubsystem<ImageBitmap> {
  return createTileStreamSubsystem<ImageBitmap>({
    device: deps.device,
    requestRender: deps.requestRender,
    atlasSide: GALAXY_ATLAS_SIDE,
    slotSide: GALAXY_ATLAS_SLOT_SIDE,
    format: GALAXY_ATLAS_FORMAT,
    label: 'galaxy-atlas',
    upload: uploadBitmapToAtlas,
    release: closeBitmap,
  });
}
