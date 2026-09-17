import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import type { RootState } from '../../store/types';

/** The ring the preview mask cuts `assetId` to: the draft while drawing it (live
 *  feedback), else the saved ring if its mask is on, else none. */
export function selectMaskRing(state: RootState, assetId: string): readonly Vec2[] | null {
  const { draft, byAssetId } = state.outline;
  if (draft?.assetId === assetId) return draft.ringM;
  const entry = byAssetId[assetId];
  return entry?.masked ? entry.ringM : null;
}
