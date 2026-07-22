import type { ConstellationsSourceEntry } from '../../@types/data/constellations/ConstellationsSourceEntry';
import { Source } from '../source';

export const CONSTELLATIONS_ENTRY = {
  type: 'constellations',
  code: Source.Constellations,
  id: 'constellations',
  label: 'Constellations',
  allSky: true, // the classical 88-constellation set spans the whole sphere
  // On by default — the stick figures are a familiar orientation aid the
  // near-field descent leans on. Users can flip it off in the SettingsPanel.
  visible: true,
  bearsLabel: false,
  bearsMarker: false,
  // 1.0 is the unit baseline; the user scales it down for a subtler overlay
  // or up for emphasis via the Constellations intensity slider.
  intensity: 1.0,
} as const satisfies ConstellationsSourceEntry;
