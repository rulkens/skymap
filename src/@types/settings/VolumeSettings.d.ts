/**
 * VolumeSettings — scalar-volume overlay master gate and per-item params.
 * `items` is the same per-item accessor galaxy catalogs / structures / star
 * catalogs / bodies expose, so all five source-type clusters share one shape.
 */

import type { VolumeFieldId } from '../data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from './VolumeFieldSettings';

export type VolumeSettings = {
  /**
   * When false, `volumeUpsamplePass.enabled` short-circuits before
   * consulting the renderer at zero GPU cost, and `scalarVolumePass` never
   * opens its half-res render pass.
   */
  enabled: boolean;
  /**
   * Per-field params (enabled / intensity / palette / …) — one settings row
   * per registry-known volume field, seeded from `SOURCE_REGISTRY` at
   * construction so the panel can show a field's toggle before its cube
   * lazy-loads.
   */
  items: Partial<Record<VolumeFieldId, VolumeFieldSettings>>;
};
