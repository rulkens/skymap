import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { assetToGroupM } from '../../scene/assetToGroupM';
import type { RootState } from '../../store/types';

/** The draft ring in the group frame, lifted to the group's top Z so the overlay sits above the
 *  surface it outlines; null outside draw mode. Draw mode only opens on Z-only rotations, so
 *  mapping at Z 0 and replacing Z leaves XY exact. */
export function selectDraftRingGroupM(state: RootState): readonly Vec3[] | null {
  const draft = state.outline.draft;
  const asset = state.group.manifest?.assets.find(({ id }) => id === draft?.assetId);
  if (!draft || !asset) return null;
  const zM = state.group.manifest?.boundsM?.max[2] ?? state.view.camera.targetM[2];
  return draft.ringM.map(([x, y]): Vec3 => {
    const [gx, gy] = assetToGroupM(asset.transform, [x, y, 0]);
    return [gx, gy, zM];
  });
}
