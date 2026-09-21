/**
 * wireHiResFamousSlot — the LOD-3 hi-res famous-galaxy pair as an asset slot.
 * Its "fetch" is a synchronous GPU allocation; the slot exists for the COMMIT,
 * where a tier flip swaps an immutably-shaped texture without the visible famous
 * galaxies dropping back to their atlas tiles (ordering comment in `commit`).
 */

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { createHiResFamousTexture } from '../../../services/gpu/resources/hiResFamousTexture';
import { createHiResFamousSubsystem } from '../subsystems/hiResFamousSubsystem';
import { HI_RES_LAYER_COUNT } from '../../../data/sources';

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { HiResFamousPair } from '../../../@types/engine/subsystems/HiResFamousPair';
import type { HiResFamousReq } from '../../../@types/loading/HiResFamousReq';
import type { TexturedDiskRenderer } from '../../../@types/rendering/TexturedDiskRenderer';
import type { TexturedDiskSubsystem } from '../../../@types/engine/subsystems/texturedDiskSubsystem/TexturedDiskSubsystem';

export function wireHiResFamousSlot(deps: {
  readonly device: GPUDevice;
  readonly requestRender: () => void;
  readonly texturedDiskRenderer: Pick<TexturedDiskRenderer, 'bindHiResArray'>;
  readonly texturedDisks: Pick<TexturedDiskSubsystem, 'setHiResFamous'>;
}): AssetSlot<HiResFamousPair, HiResFamousReq> {
  const slot = createAssetSlot<HiResFamousPair, HiResFamousReq>({
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
      // The slot still holds the PREVIOUS pair here: `AssetSlot` awaits `commit`
      // before dispatching `committed`, so this read precedes the hand-over. The
      // mirror fields this replaces existed only to answer this one question.
      const previous = slot.committed()?.value ?? null;

      // Bind and hand over FIRST: between these two lines and the destroys below
      // there is no frame where the renderer samples a dead view or the planner
      // reference is absent, so no famous galaxy drops to its atlas tile.
      deps.texturedDiskRenderer.bindHiResArray(pair.texture.getTextureView());
      deps.texturedDisks.setHiResFamous(pair.subsystem);

      // Subsystem before texture: the planner holds the texture's evict-handler
      // subscription, so the reverse order fires eviction into a torn-down planner.
      previous?.subsystem.destroy();
      previous?.texture.destroy();
    },
  });
  return slot;
}
