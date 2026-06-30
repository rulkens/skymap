import type { HiResFamousPerGalaxyState } from '../../../@types/engine/subsystems/HiResFamousSubsystem';

/** Sentinel: no hi-res layer assigned — the shader's `hiResLayerIdx >= 0` gate skips the LOD-3 sample. */
const NO_HI_RES: HiResFamousPerGalaxyState = { hiResLayerIdx: -1, hiResCrossfadeAlpha: 0 };

/**
 * hiResLayerFold — the LOD-3 state the textured-disk planner folds into a row,
 * or the atlas-tile-only sentinel when none applies.
 *
 * `byFamousIdx` is the hi-res planner's per-frame output, keyed by Famous-source
 * local index. A row gets a real `(layerIdx, crossfadeAlpha)` only when that
 * planner is wired AND has assigned this galaxy a layer; every other row — every
 * non-famous source, and famous rows under the 200 px gate or mid-fetch — folds
 * the `-1 / 0` sentinel, which the fragment shader reads as "sample the atlas
 * tile, skip the hi-res array".
 *
 * `undefined` covers the no-hi-res-planner case (the optional dependency is
 * absent) so the caller passes `hiResFamous?.lastOutput.byFamousIdx` directly
 * without its own guard. Pure: same map + index → same state, no branch shell
 * in the loop body.
 */
export function hiResLayerFold(
  byFamousIdx: ReadonlyMap<number, HiResFamousPerGalaxyState> | undefined,
  i: number,
): HiResFamousPerGalaxyState {
  return byFamousIdx?.get(i) ?? NO_HI_RES;
}
