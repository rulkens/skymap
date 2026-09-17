import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import type { RootState } from '../../store/types';

/** The ring the preview mask cuts `assetId` to: none while drawing it (the whole
 *  mesh stays visible to trace against), else the saved ring if its mask is on. */
export function selectMaskRing(state: RootState, assetId: string): readonly Vec2[] | null {
  const { draft, byAssetId } = state.outline;
  if (draft?.assetId === assetId) return null;
  const entry = byAssetId[assetId];
  return entry?.masked ? entry.ringM : null;
}
