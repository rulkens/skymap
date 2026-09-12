/**
 * `SOENDERMARKEN_CROP`'s box and anchor over the **2019** flight instead of
 * 2025 — a 23 June midsummer capture against 27 April's bare-ish canopy,
 * directly comparable in the same ENU metres.
 *
 * A different camera flew it (UltraCam Osprey, ~0.10 m GSD, 7700 × 10300 px
 * sensor), which the pose code reads per-item from `pers:` rather than from
 * anything stated here.
 */
import { SOENDERMARKEN_CROP } from './soendermarkenCrop';
import type { SceneGroupDefinition } from '../@types/SceneGroupDefinition';

export const SOENDERMARKEN_CROP_2019: SceneGroupDefinition = {
  ...SOENDERMARKEN_CROP,
  id: 'soendermarken-crop-2019',
  name: 'Søndermarken (crop, 2019 leaf-on)',
  skraafoto: { collection: 'skraafotos2019', groundMmPerPx: 100 },
};
