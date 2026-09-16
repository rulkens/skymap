/**
 * galaxyAtlasSubsystem — the galaxy thumbnail atlas.
 *
 * Configures the generic `tileStreamSubsystem` with the galaxy thumbnail
 * atlas's geometry, pixel format and bitmap upload/release: this is the
 * only galaxy-specific knowledge in the LOD-2 atlas path, everything else
 * (LRU clock, fetch queue, failure memoisation, eviction hook) lives in
 * `tileStreamSubsystem`, which has no notion of what it's streaming.
 */

import { createTileStreamSubsystem } from '../../../services/engine/subsystems/tileStreamSubsystem';
import { GALAXY_ATLAS_SLOT_SIDE } from '../../../data/galaxyCatalog/galaxyAtlasSlotSide';
import type { TileStreamSubsystem } from '../../../@types/engine/subsystems/TileStreamSubsystem';
import type { GalaxyAtlasDeps } from '../../../@types/engine/subsystems/GalaxyAtlasDeps';
import { uploadBitmapToAtlas } from '../../../utils/gpu/uploadBitmapToAtlas';
import { closeBitmap } from '../../../utils/gpu/closeBitmap';

// Geometry of the galaxy thumbnail atlas: a single 2048×2048 texture
// sliced into a 16×16 grid of 128×128 slots (256 thumbnails total).
const GALAXY_ATLAS_SIDE = 2048;
const GALAXY_ATLAS_FORMAT: GPUTextureFormat = 'rgba8unorm-srgb';

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
