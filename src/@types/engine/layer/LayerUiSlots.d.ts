import type { LayerUiSection } from './LayerUiSection';
import type { LayerSettingsRow } from './LayerSettingsRow';
import type { LayerDetailCard } from './LayerDetailCard';

/**
 * LayerUiSlots — every panel surface a Layer's `ui` entries can target: whole
 * sections (`main` in SettingsPanel, `debug` in DebugPanel), one data row
 * folded into an existing section (`labelsAndGuides`), or one InfoCard arm
 * (`detailCard`). `LayerUiEntry` is derived from this map, so a new slot is
 * added here once.
 */
export type LayerUiSlots = {
  main: LayerUiSection;
  debug: LayerUiSection;
  labelsAndGuides: LayerSettingsRow;
  detailCard: LayerDetailCard;
};
