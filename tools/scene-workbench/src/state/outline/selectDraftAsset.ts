import type { SceneAsset } from '../../../@types/SceneAsset';
import type { RootState } from '../../store/types';

/** The asset the open draft outlines; undefined outside draw mode or once its manifest is gone. */
export function selectDraftAsset(state: RootState): SceneAsset | undefined {
  const assetId = state.outline.draft?.assetId;
  return state.group.manifest?.assets.find(({ id }) => id === assetId);
}
