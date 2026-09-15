/**
 * wireHiResFamousSlot — mints the LOD-3 hi-res famous-galaxy pair as an asset slot.
 *
 * The "fetch" is a synchronous GPU allocation, not a download, so the slot exists
 * for its commit: a tier flip changes `layerSide`, WebGPU textures are immutable in
 * shape, and the pair has to be swapped without the visible famous galaxies falling
 * back to their atlas tiles in between. Binding and handing over before destroying
 * is what buys that; see the ordering comment in `commit`.
 */

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { createHiResFamousTexture } from '../../../services/gpu/resources/hiResFamousTexture';
import { createHiResFamousSubsystem } from '../subsystems/hiResFamousSubsystem';
import { HI_RES_LAYER_COUNT } from '../../../data/sources';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { HiResFamousPair } from '../../../@types/engine/subsystems/HiResFamousPair';
import type { HiResFamousReq } from '../../../@types/loading/HiResFamousReq';
import type { TexturedDiskRenderer } from '../../../@types/rendering/TexturedDiskRenderer';

export function wireHiResFamousSlot(
  state: EngineState,
  device: GPUDevice,
  texturedDiskRenderer: Pick<TexturedDiskRenderer, 'bindHiResArray'>,
): void {
  state.assetSlots.hiResFamous = createAssetSlot<HiResFamousPair, HiResFamousReq>({
    name: 'hi-res-famous',
    fetch: async (req) => {
      // `initTexture()` is mandatory before `getTextureView()` — the handle throws
      // otherwise.
      const texture = createHiResFamousTexture({
        device,
        layerSide: req.layerSide,
        layerCount: HI_RES_LAYER_COUNT,
      });
      texture.initTexture();
      return {
        texture,
        subsystem: createHiResFamousSubsystem({
          texture,
          requestRender: () => state.subsystems.scheduler.requestRender(),
        }),
      };
    },
    commit: async (pair) => {
      // Bind and hand over FIRST: between these two lines and the destroys below
      // there is no frame where the renderer samples a dead view or the planner
      // reference is absent, so no famous galaxy drops to its atlas tile.
      texturedDiskRenderer.bindHiResArray(pair.texture.getTextureView());
      state.subsystems.texturedDisks?.setHiResFamous(pair.subsystem);

      const previous = {
        subsystem: state.subsystems.hiResFamous,
        texture: state.subsystems.hiResFamousTexture,
      };
      state.subsystems.hiResFamous = pair.subsystem;
      state.subsystems.hiResFamousTexture = pair.texture;

      // Subsystem before texture: the planner holds the texture's evict-handler
      // subscription, so the reverse order fires eviction into a torn-down planner.
      previous.subsystem?.destroy();
      previous.texture?.destroy();
    },
  });
}
