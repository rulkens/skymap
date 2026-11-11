import { GALAXY_CATALOG_SOURCE_ROWS } from '../../../../../../src/layers/galaxyCatalog/sources/galaxyCatalogSourceRows';

export const SETTING_OPTIONS = [
  { value: 'flow', text: 'Flow field' },
  { value: 'labels', text: 'Focused labels' },
  { value: 'catalog', text: 'Catalog' },
];

/** Shown only on a step that already tunes the flow: tuning has no on/off to switch from. */
export const TUNING_OPTION = { value: 'tuning', text: 'Flow tuning' };

export const CATALOG_OPTIONS = GALAXY_CATALOG_SOURCE_ROWS.map((entry) => ({
  value: entry.id,
  text: entry.label,
}));

export const ON_OFF_OPTIONS = [
  { value: 'on', text: 'On' },
  { value: 'off', text: 'Off' },
];
