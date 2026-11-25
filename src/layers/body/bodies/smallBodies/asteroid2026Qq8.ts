/**
 * 2026 QQ8, a metre-sized near-Earth asteroid on its sampled Horizons track (2026-02-01 to
 * 2027-03-31): absent outside it, and never launched. Size from arXiv 2611.31213 (1.4–2.5 m by
 * assumed albedo); its spin and pole are unmeasured, so the row has no rotation.
 */

import type { LayerBody } from '../../../../@types/engine/layer/LayerBody';
import { smallBody } from '../makers/smallBody';
import { asSceneBodyId } from '../../../../utils/scene/asSceneBodyId';

export const ASTEROID_2026_QQ8: LayerBody = {
  // Appended after Bennu: SCENE_PLANETS is append-only (a pick decodes by array position).
  body: smallBody({
    id: '2026-qq8',
    label: '2026 QQ8',
    datumRadiusM: 0.8,
    albedo: [0.3, 0.29, 0.28],
  }),
  position: { kind: 'sampled', sampled: { id: asSceneBodyId('2026-qq8') } },
};
