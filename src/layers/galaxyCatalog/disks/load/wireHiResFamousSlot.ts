/**
 * wireHiResFamousSlot — the LOD-3 hi-res famous-galaxy pair as an asset slot.
 * Its "fetch" is a synchronous GPU allocation; the slot exists for the COMMIT,
 * where a tier flip swaps an immutably-shaped texture without the visible famous
 * galaxies dropping back to their atlas tiles (ordering comment in `commit`).
 */

import { createAssetSlot } from '../../../../services/loading/AssetSlot';
import { createHiResFamousTexture } from '../../hiResFamous/load/hiResFamousTexture';
import { createHiResFamousSubsystem } from '../../hiResFamous/subsystems/hiResFamousSubsystem';
import { HI_RES_LAYER_COUNT } from '../../hiResFamous/data/hiResLayerCount';

import type { AssetSlot } from '../../../../@types/loading/AssetSlot';
import type { HiResFamousPair } from '../../hiResFamous/@types/HiResFamousPair';
import type { HiResFamousReq } from '../../hiResFamous/@types/HiResFamousReq';
import type { TexturedDiskRenderer } from '../textured/@types/TexturedDiskRenderer';
import type { TexturedDiskSubsystem } from '../textured/@types/TexturedDiskSubsystem';

export function wireHiResFamousSlot(deps: {
  readonly device: GPUDevice;
  readonly requestRender: () => void;
  readonly texturedDiskRenderer: Pick<TexturedDiskRenderer, 'bindHiResArray'>;
  readonly texturedDisks: Pick<TexturedDiskSubsystem, 'setHiResFamous'>;
}): AssetSlot<HiResFamousPair, HiResFamousReq> {
  // What the renderer has bound, which a pair superseded mid-commit makes differ from
  // `slot.committed()`: its commit bound it, but the slot never recorded it.
  let bound: HiResFamousPair | null = null;
  return createAssetSlot<HiResFamousPair, HiResFamousReq>({
    name: 'hi-res-famous',
    fetch: async (req) => {
      // `initTexture()` is mandatory before `getTextureView()` — the handle throws
      // otherwise.
      const texture = createHiResFamousTexture({
        device: deps.device,
        layerSide: req.layerSide,
        layerCount: HI_RES_LAYER_COUNT,
      });
      texture.initTexture();
      return {
        texture,
        subsystem: createHiResFamousSubsystem({
          texture,
          requestRender: deps.requestRender,
        }),
      };
    },
    commit: async (pair) => {
      const previous = bound;
      bound = pair;

      // Bind and hand over FIRST: between these two lines and the destroys below
      // there is no frame where the renderer samples a dead view or the planner
      // reference is absent, so no famous galaxy drops to its atlas tile.
      deps.texturedDiskRenderer.bindHiResArray(pair.texture.getTextureView());
      deps.texturedDisks.setHiResFamous(pair.subsystem);
      if (previous) destroyPair(previous);
    },
    dispose: destroyPair,
  });
}

// Subsystem before texture: the planner holds the texture's evict-handler
// subscription, so the reverse order fires eviction into a torn-down planner.
function destroyPair(pair: HiResFamousPair): void {
  pair.subsystem.destroy();
  pair.texture.destroy();
}
