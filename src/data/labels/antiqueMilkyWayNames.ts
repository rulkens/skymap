/**
 * ANTIQUE_MILKY_WAY_NAMES — what the antique plate engraves across the Milky Way
 * seen from outside. No 17th-century plate drew the Galaxy from outside (Wright's
 * 1750 disc and Rosse's 1845 spiral came later), so these are modern names put
 * into the plate's Latin: arms as "brachium" + genitive, the Orion Spur as a
 * "ramus" (branch), the bar as Seneca's "trabs" (a beam of light in the sky) and
 * the bulge as Hevelius's "nucleus" (a comet's bright head). The generator's four
 * arms cross the Sun–centre line where the real ones do (Reid et al. 2019): arm 1
 * inside the Sun (Sagittarius), arm 0 outside (Perseus), arm 2 at 4 kpc (Scutum),
 * arm 3 far out (Norma–Outer, one arm under two names); a test holds that order.
 */

import type { AntiqueMilkyWayName } from '../../@types/rendering/AntiqueMilkyWayName';

export const ANTIQUE_MILKY_WAY_NAMES: readonly AntiqueMilkyWayName[] = [
  // Hangs under the Sun, as a caption under its mark; it stands in for "You are here".
  {
    id: 'mwName-sun',
    name: 'Sol hic',
    cut: 'italic',
    alignY: 'top',
    at: { azimuthDeg: 180, radiusKpc: 8.178 },
  },
  {
    id: 'mwName-perseus',
    name: 'Brachium Persei',
    cut: 'spacedItalic',
    at: { arm: 0, radiusKpc: 11.5 },
  },
  {
    id: 'mwName-sagittarius',
    name: 'Brachium Sagittarii',
    cut: 'spacedItalic',
    at: { arm: 1, radiusKpc: 5.5 },
  },
  {
    id: 'mwName-scutum',
    name: 'Brachium Scuti-Centauri',
    cut: 'spacedItalic',
    at: { arm: 2, radiusKpc: 12.5 },
  },
  {
    id: 'mwName-norma',
    name: 'Brachium Normae',
    cut: 'spacedItalic',
    at: { arm: 3, radiusKpc: 6 },
  },
  {
    id: 'mwName-outer',
    name: 'Brachium Exterius',
    cut: 'spacedItalic',
    at: { arm: 3, radiusKpc: 15 },
  },
  // Reid et al. 2019's Local arm, 6° of azimuth ahead of its kink.
  {
    id: 'mwName-orion',
    name: 'Ramus Orionis',
    cut: 'spacedItalic',
    at: { azimuthDeg: 165, radiusKpc: 8.1 },
  },
  // The bar named past its tip; the bulge on its sunward side, clear of the arm names.
  { id: 'mwName-bar', name: 'Trabs', cut: 'spacedItalic', at: { azimuthDeg: 27, radiusKpc: 3.2 } },
  {
    id: 'mwName-bulge',
    name: 'Nucleus',
    cut: 'spacedItalic',
    at: { azimuthDeg: 150, radiusKpc: 2.2 },
  },
];
