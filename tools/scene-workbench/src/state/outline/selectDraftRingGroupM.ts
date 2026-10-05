import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { assetToGroupM } from '../../scene/assetToGroupM';
import type { RootState } from '../../store/types';
import { selectDraftAsset } from './selectDraftAsset';

/** The draft ring in the group frame at Z 0, and whether it is closed; null outside draw mode.
 *  Z is free: the overlay tests depth 'always' and draw mode is orthographic top-down. */
export function selectDraftRingGroupM(
  state: RootState,
): { ringGroupM: readonly Vec3[]; closed: boolean } | null {
  const draft = state.outline.draft;
  const asset = selectDraftAsset(state);
  if (!draft || !asset) return null;
  const ringGroupM = draft.ringM.map(([x, y]) => assetToGroupM(asset.transform, [x, y, 0]));
  return { ringGroupM, closed: draft.closed };
}
