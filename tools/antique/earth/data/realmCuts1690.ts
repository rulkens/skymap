/**
 * REALM_CUTS_1690 — historical lines through modern admin-1 units. For each
 * unit the cuts listing it apply in order, each taking its part of what is left
 * (parts under 25 km² stay with the unit: a historical line running near, not
 * on, the modern edge). OpenHistoricalMap relations (CC0, `OHM_RELATIONS_1690`)
 * give the Rhineland and the Low Countries' lines; the rest are hand rings,
 * straight-sided where no better source was found.
 */

import type { RealmCut1690 } from '../@types/RealmCut1690';
import { lonLatBoxRing } from '../utils/lonLatBoxRing';

// One cut per row, for review.
// prettier-ignore
export const REALM_CUTS_1690: readonly RealmCut1690[] = [
  { units: ['DE-NW'], ohmRelations: [2806958], target: 'westphDucatus' }, // Herzogtum Westfalen
  { units: ['DE-NW', 'DE-RP'], ohmRelations: [2831106], target: 'colonia' }, // Kurfürstentum Köln
  { units: ['DE-NW', 'DE-NI'], ohmRelations: [2807030], target: 'monasterium' }, // Hochstift Münster
  { units: ['DE-NW'], ohmRelations: [2744511], target: 'clivia' }, // Herzogtum Kleve
  { units: ['DE-NW'], ohmRelations: [2696468], target: 'montes' }, // Herzogtum Berg
  { units: ['DE-NW'], ohmRelations: [2809747], target: 'marchia' }, // Grafschaft Mark
  { units: ['DE-NW'], ohmRelations: [2806963], target: 'paderborna' }, // Hochstift Paderborn
  { units: ['DE-NI', 'DE-NW'], ohmRelations: [2748665], target: 'osnabrugum' }, // Hochstift Osnabrück
  { units: ['DE-NI'], ohmRelations: [2695999, 2840402], target: 'frisiaOr' }, // Fürstentum Ostfriesland
  { units: ['DE-NI'], ohmRelations: [2851710], target: 'oldenburgum' }, // Grafschaft Oldenburg
  { units: ['DE-NI', 'DE-HB'], ohmRelations: [2896786], target: 'bremae' }, // Bremen-Verden
  { units: ['DE-RP', 'DE-HE'], ohmRelations: [2830738], target: 'moguntia' }, // Kurfürstentum Mainz
  { units: ['NL-LI', 'DE-NW'], ohmRelations: [2831525], target: 'gelriaSup' }, // Herzogtum Obergeldern
  { units: ['BE-WLG', 'NL-LI'], ohmRelations: [2810096], target: 'limburgum' }, // Herzogtum Limburg
  { units: ['BE-WLG', 'BE-VLI', 'BE-WNA', 'BE-WHT', 'NL-LI'], ohmRelations: [2946204], target: 'leodium' }, // Principatus episcopalis Leodiensis
  { units: ['BE-WLX', 'LU-D', 'LU-G', 'LU-L', 'DE-RP', 'DE-SL'], ohmRelations: [2815497], target: 'luxemburgum' }, // Herzogtum Luxemburg
  { units: ['FR-54', 'FR-55', 'FR-57', 'FR-88'], ohmRelations: [2815082], target: 'gallia' }, // Trois-Évêchés
  { units: ['FR-54', 'FR-55', 'FR-57', 'FR-88', 'DE-SL'], ohmRelations: [2815358], target: 'lotharingia' }, // Duché de Lorraine
  { units: ['FR-54', 'FR-55', 'FR-57', 'FR-88'], ohmRelations: [2815360], target: 'lotharingia' }, // Duché de Bar
  { units: ['NL-ZE'], ring: lonLatBoxRing(3.2, 51.15, 4.35, 51.415), target: 'flandriaFoed' },
  { units: ['NL-LI'], ring: lonLatBoxRing(5.55, 50.7, 6.05, 50.93), target: 'traiectumMosam' },
  { units: ['DE-NW'], ring: [[5.85, 51.2], [6.4, 51.27], [6.68, 51.15], [6.8, 50.85], [6.6, 50.48], [6.25, 50.45], [5.95, 50.72], [5.85, 51]], target: 'iuliacum' },
  { units: ['DE-NW'], ring: [[8.3, 52], [8.4, 52.5], [8.95, 52.55], [9.15, 52.25], [8.92, 51.98], [8.5, 51.92]], target: 'mindena' },
  { units: ['DE-NI'], ring: lonLatBoxRing(6.6, 52, 8.25, 53.85), target: 'circWestphalicus' },
  { units: ['DE-RP'], ring: [[6, 50.5], [7, 50.45], [7.6, 50.42], [7.68, 50.2], [7.3, 49.95], [7, 49.62], [6.7, 49.42], [6.35, 49.42], [6.1, 49.8]], target: 'treviri' },
  { units: ['DE-RP', 'DE-BW'], ring: [[7.3, 49.78], [8.5, 49.66], [8.95, 49.55], [8.9, 49.25], [8.2, 49], [7.4, 49.1], [7, 49.42]], target: 'palatinatus' },
  { units: ['DE-HE'], ring: lonLatBoxRing(7.7, 49.3, 9.2, 50.25), target: 'hassiaDarm' },
  { units: ['DE-BW'], ring: [[7.4, 48.3], [8.1, 48.3], [8.3, 47.95], [8.3, 47.5], [7.4, 47.5]], target: 'brisgovia' },
  { units: ['DE-BW'], ring: [[7.9, 49.1], [8.6, 49.2], [8.6, 48.3], [8, 48.3], [7.9, 48.6]], target: 'badena' },
  { units: ['DE-BW'], ring: [[9.6, 47.4], [10.6, 47.4], [10.6, 49], [9.9, 48.6], [9.2, 48.15], [9, 47.7]], target: 'circSuevicus' },
  { units: ['DE-BY'], ring: [[8.9, 50.6], [10, 50.65], [11.4, 50.6], [12.15, 50.32], [12.05, 49.85], [11.62, 49.6], [11.58, 49.1], [10.95, 48.95], [10.3, 48.95], [9.9, 49.3], [8.95, 49.6]], target: 'circFranconicus' },
  { units: ['DE-BY'], ring: [[9.9, 48.95], [10.95, 48.95], [10.98, 48.4], [10.9, 47.75], [10.8, 47.3], [9.9, 47.5]], target: 'circSuevicus' },
  { units: ['DE-SH'], ring: lonLatBoxRing(8, 54.33, 11.5, 55.2), target: 'slesvicum' },
  { units: ['DE-MV'], ring: [[12.35, 54.5], [14.4, 54.7], [14.45, 53.85], [13.9, 53.75], [13, 53.85], [12.5, 54.2]], target: 'pomeraniaSu' },
  { units: ['DE-MV'], ring: lonLatBoxRing(13, 53.85, 14.45, 53.3), target: 'pomeraniaUlt' },
  { units: ['DE-MV'], ring: lonLatBoxRing(11.35, 53.85, 11.6, 54.08), target: 'pomeraniaSu' },
  { units: ['PL-ZP'], ring: lonLatBoxRing(14.1, 53.2, 14.66, 54), target: 'pomeraniaSu' },
  { units: ['DE-ST'], ring: lonLatBoxRing(10.5, 52.4, 12.5, 53.1), target: 'brandenburgum' },
  { units: ['PL-LB'], ring: lonLatBoxRing(14.4, 52.22, 16.5, 53.2), target: 'brandenburgum' },
  { units: ['PL-SL'], ring: lonLatBoxRing(17.5, 49.3, 19.1, 50.9), target: 'silesia' },
  { units: ['PL-WN'], ring: [[19.7, 54.44], [20.05, 54.42], [20.9, 54.2], [20.9, 53.68], [20.4, 53.52], [20.1, 53.72], [19.75, 54.15]], target: 'polonia' },
  { units: ['PL-WN'], ring: lonLatBoxRing(18.9, 53.4, 19.62, 54.5), target: 'polonia' },
  { units: ['LT-KL'], ring: lonLatBoxRing(20.9, 55.25, 21.6, 55.95), target: 'borussia' },
  { units: ['UA-32'], ring: [[30.55, 51.6], [32.6, 51.6], [32.6, 49.5], [31.7, 49.6], [31.2, 50], [30.65, 50.35], [30.55, 50.6], [30.45, 51]], target: 'ukraina' },
  { units: ['UA-68'], ring: lonLatBoxRing(26, 48, 28, 49.4), target: 'podolia' },
  { units: ['UA-05'], ring: lonLatBoxRing(27.5, 48, 28.6, 49.3), target: 'podolia' },
  { units: ['UA-61'], ring: lonLatBoxRing(25.5, 48.5, 26.5, 49.3), target: 'podolia' },
  { units: ['UA-23'], ring: lonLatBoxRing(34, 46, 37.5, 47.35), target: 'tartariaMinor' },
  { units: ['MD-SN'], ring: lonLatBoxRing(28.5, 47.4, 30.5, 48.6), target: 'polonia' },
  { units: ['RU-LEN'], ring: lonLatBoxRing(27.5, 58.4, 31.6, 61.8), target: 'ingria' },
  { units: ['RU-KR'], ring: lonLatBoxRing(29, 60.5, 31.3, 62.3), target: 'carelia' },
  { units: ['GR-G'], ring: lonLatBoxRing(20.5, 36.5, 23, 38.31), target: 'morea' }, // Venetian Morea takes Achaea and Elis
  { units: ['HR-18'], ring: lonLatBoxRing(13.8, 45.15, 14.3, 45.4), target: 'carniola' }, // inner Istria (Pazin) Habsburg
  { units: ['RU-KHA'], ring: lonLatBoxRing(130, 42, 142, 52), target: 'sina' }, // south of the Nerchinsk line stays Qing
  { units: ['CA-NL'], ring: lonLatBoxRing(-68, 51.6, -52, 61), target: null }, // Labrador
  { units: ['CA-QC'], ring: [[-79.5, 45], [-74.5, 45], [-71.5, 45], [-70, 46], [-64, 48], [-64, 50.3], [-70, 48.9], [-75, 47.5], [-79.5, 46.5]], target: 'novaFrancia' },
  { units: ['ZA-WC'], ring: lonLatBoxRing(17.8, -34.9, 19.6, -33), target: 'caputBonaeSpei' },
];
