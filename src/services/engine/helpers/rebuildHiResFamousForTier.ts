/**
 * rebuildHiResFamousForTier — tear down + recreate the LOD-3 hi-res
 * famous-galaxy texture + planner pair at the new tier's `layerSide`.
 *
 * ## Why a tier change forces a rebuild
 *
 * The hi-res `texture_2d_array` is sized at construction (`layerSide ×
 * layerSide × layerCount`).  Tier flips change the desired layerSide
 * (`HI_RES_LAYER_SIDE_BY_TIER`: 512 px for small / mobile, 1024 px for
 * medium + large), and WebGPU textures are immutable in shape.  The
 * cleanest fix — and the one the spec calls out — is to destroy the
 * existing pair and recreate at the new dim.  All in-flight layer slots
 * are discarded; the user perceives a brief loss of high-res on
 * visible famous galaxies, which refetch + reload in the new dim.
 *
 * ## Teardown order matters
 *
 * The same invariant `engine.destroy()` documents at lines 1355-1362:
 * the planner subscribes to the texture's `setEvictHandler`, so tearing
 * down the subsystem FIRST prevents the texture's destroy-time
 * cleanup from firing into a torn-down planner.  Order here mirrors
 * destroy(): subsystem first, texture second.
 *
 * ## Re-binding the renderer view
 *
 * `texturedDiskRenderer.bindHiResArray(view)` caches the view on the
 * inner instancedQuadRenderer's BGL composition gate (see R2 + R3).
 * The OLD view points at the now-destroyed texture; calling
 * `bindHiResArray` with the NEW view rewires the BGL so subsequent
 * draws sample the new texture.  Order matters: re-bind AFTER
 * recreating the texture (the new view doesn't exist before then).
 *
 * ## Why the textured-disk subsystem swaps its planner ref, not rebuilds
 *
 * `texturedDiskSubsystem` captures `hiResFamous` via closure at
 * construction.  Tearing the whole subsystem down on tier change
 * would invalidate its per-key load-fade timestamps AND its sticky
 * disk maps for ALL galaxies, not just famous ones.  Instead, the
 * subsystem exposes `setHiResFamous(...)` and we hand it the new
 * planner reference — the unrelated atlas-tile fade-ins for
 * SDSS / 2MRS / GLADE galaxies keep their timing across tier flips.
 *
 * ## Factory seams for testability
 *
 * `createTextureFn` + `createSubsystemFn` accept the real factories
 * by default; tests inject mocks so the helper's orchestration can be
 * asserted without standing up a real GPU device.
 */

import { HI_RES_LAYER_COUNT, HI_RES_LAYER_SIDE_BY_TIER } from '../../../data/sources';
import { createHiResFamousTexture as defaultCreateHiResFamousTexture } from '../../gpu/resources/hiResFamousTexture';
import { createHiResFamousSubsystem as defaultCreateHiResFamousSubsystem } from '../subsystems/hiResFamousSubsystem';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Tier } from '../../../@types/data/Tier';
import type {
  CreateHiResFamousTextureArgs,
  HiResFamousTexture,
} from '../../../@types/rendering/HiResFamousTexture';
import type { HiResFamousSubsystem } from '../../../@types/engine/subsystems/HiResFamousSubsystem';
import type { HiResFamousDeps } from '../subsystems/hiResFamousSubsystem';
import type { TexturedDiskRenderer } from '../../../@types/rendering/TexturedDiskRenderer';

export type RebuildHiResFamousForTierDeps = {
  readonly state: EngineState;
  readonly device: GPUDevice;
  readonly tier: Tier;
  readonly texturedDiskRenderer: Pick<TexturedDiskRenderer, 'bindHiResArray'>;
  readonly requestRender: () => void;
  /** Test seam — defaults to the real factory. */
  readonly createTextureFn?: (args: CreateHiResFamousTextureArgs) => HiResFamousTexture;
  /** Test seam — defaults to the real factory. */
  readonly createSubsystemFn?: (deps: HiResFamousDeps) => HiResFamousSubsystem;
};

export function rebuildHiResFamousForTier(deps: RebuildHiResFamousForTierDeps): void {
  const {
    state,
    device,
    tier,
    texturedDiskRenderer,
    requestRender,
    createTextureFn = defaultCreateHiResFamousTexture,
    createSubsystemFn = defaultCreateHiResFamousSubsystem,
  } = deps;

  // 1. Tear down the subsystem first (it holds the planner's subscription
  //    to the texture's evict handler — if the texture went first, that
  //    handler would fire into a torn-down planner).
  state.subsystems.hiResFamous?.destroy();
  state.subsystems.hiResFamous = null;

  // 2. Tear down the texture.  After this the cached `GPUTextureView`
  //    on the renderer's BGL is also stale — step 4 below replaces it.
  state.subsystems.hiResFamousTexture?.destroy();
  state.subsystems.hiResFamousTexture = null;

  // 3. Drop the renderer's stale planner reference. Until step 6 hands
  //    over the new one, every Famous-source disk emits the -1 / 0
  //    sentinel — atlas-tile-only rendering, no hi-res sample.
  state.subsystems.texturedDisks?.setHiResFamous(undefined);

  // 4. Recreate the texture at the new layerSide.  `initTexture()` is
  //    mandatory before `getTextureView()` — the handle throws otherwise.
  const layerSide = HI_RES_LAYER_SIDE_BY_TIER[tier];
  const hiResFamousTexture = createTextureFn({
    device,
    layerSide,
    layerCount: HI_RES_LAYER_COUNT,
  });
  hiResFamousTexture.initTexture();

  // 5. Recreate the subsystem.  Same construction shape as the bootstrap
  //    path in wireSlots.ts — pass the texture handle + a requestRender
  //    fn so newly-loaded bitmaps wake the render loop.
  const hiResFamous = createSubsystemFn({
    texture: hiResFamousTexture,
    requestRender,
  });

  // 6. Rebind the renderer's hi-res view to the NEW texture.  Must come
  //    after `initTexture()` (the view doesn't exist before then) and
  //    after planner construction (so the planner is ready for the next
  //    frame the renderer draws).
  texturedDiskRenderer.bindHiResArray(hiResFamousTexture.getTextureView());

  // 7. Hand the new planner to the textured-disk subsystem so its
  //    per-frame `hiResFamous.lastOutput.byFamousIdx.get(i)` reads
  //    target the new instance.
  state.subsystems.texturedDisks?.setHiResFamous(hiResFamous);

  // 8. Publish the new handles on EngineState so destroy() and any
  //    future tier change reach the live instances (not the torn-down
  //    pair from step 1-2).
  state.subsystems.hiResFamous = hiResFamous;
  state.subsystems.hiResFamousTexture = hiResFamousTexture;
}
