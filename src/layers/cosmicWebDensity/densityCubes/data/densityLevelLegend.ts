// The "Colour by level" legend (Okabe-Ito, so no pair leans on red against green).
// scalarVolume/constants.wesl's LEVEL_TINTS holds the same colours in linear light, in this order:
// the shader indexes by it.
export const DENSITY_LEVEL_LEGEND = [
  { label: 'Detail region', color: '#F0E442' },
  { label: 'Region fading in', color: '#E69F00' },
  { label: 'Region fading out', color: '#CC79A7' },
  { label: 'Base, finest level', color: '#009E73' },
  { label: 'Base, next level', color: '#56B4E9' },
  { label: 'Base, coarser', color: '#0072B2' },
] as const;
