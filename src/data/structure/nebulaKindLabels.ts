import type { NebulaKind } from '../../@types/data/structure/NebulaKind';

export const NEBULA_KIND_LABELS: Readonly<Record<NebulaKind, string>> = {
  emission: 'Emission nebula',
  reflection: 'Reflection nebula',
  planetary: 'Planetary nebula',
  'supernova-remnant': 'Supernova remnant',
  dark: 'Dark nebula',
};
