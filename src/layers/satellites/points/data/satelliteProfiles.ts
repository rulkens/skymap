import type { SatelliteProfile } from '../@types/SatelliteProfile';

/**
 * Index = the profile code each instance carries to the GPU; the order is part of that contract.
 * Area bases: 22.68 arXiv 2305.11123; 104.96 arXiv 2306.06657; 71 derived from ESA's
 * Eurostar 3000 L array (8 x 3.915 x 2.28 m); 10.82 GSC Galileo metadata; 3.88 is SARAL's array,
 * our default where no public figure exists (OneWeb, Kuiper, Qianfan, Guowang); 1 is our choice.
 */
export const SATELLITE_PROFILES: readonly SatelliteProfile[] = [
  {
    id: 'starlink-v1',
    label: 'Starlink V1',
    color: [0.55, 0.72, 1.0],
    areaM2: 22.68,
    glintGain: 1,
  },
  {
    id: 'starlink-v2-mini',
    label: 'Starlink V2 Mini',
    color: [0.42, 0.62, 1.0],
    areaM2: 104.96,
    glintGain: 1,
  },
  { id: 'oneweb', label: 'OneWeb', color: [0.3, 0.9, 0.75], areaM2: 3.88, glintGain: 1 },
  { id: 'kuiper', label: 'Kuiper', color: [1.0, 0.62, 0.22], areaM2: 3.88, glintGain: 1 },
  { id: 'qianfan', label: 'Qianfan', color: [0.95, 0.4, 0.55], areaM2: 3.88, glintGain: 1 },
  { id: 'guowang', label: 'Guowang', color: [0.95, 0.3, 0.25], areaM2: 3.88, glintGain: 1 },
  { id: 'leo', label: 'Low orbit', color: [0.75, 0.8, 0.85], areaM2: 3.88, glintGain: 1 },
  { id: 'meo', label: 'Medium orbit', color: [0.5, 0.9, 0.4], areaM2: 10.82, glintGain: 1 },
  { id: 'geo', label: 'Geostationary', color: [1.0, 0.82, 0.35], areaM2: 71, glintGain: 1 },
  { id: 'heo', label: 'High elliptical', color: [0.75, 0.5, 1.0], areaM2: 3.88, glintGain: 1 },
  { id: 'debris', label: 'Debris', color: [0.6, 0.38, 0.3], areaM2: 1, glintGain: 0 },
  { id: 'other', label: 'Unidentified', color: [0.5, 0.5, 0.5], areaM2: 1, glintGain: 0 },
];
