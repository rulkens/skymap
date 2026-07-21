/**
 * Mock `useFamousStarsMeta` for the design-sync bundle.
 *
 * The real hook fetches `famous_stars_meta.json` at runtime, which isn't
 * available inside claude.ai/design. This mock returns a small, curated set of
 * entries synchronously (ready = true) so the InfoCard's famous-star body card
 * renders its rich physical rows (spectral type, mass, luminosity, age, prose)
 * instead of the headline-only fail-soft state. The design-bundle Vite config
 * aliases the real hook to this file; nothing in the app build sees it.
 *
 * Fixture body-star ids MUST match an `id` here for the merge to light up.
 */

import type { FamousStarMetaEntry } from '../../src/@types/loading/FamousStarMetaEntry';
import type { UseFamousStarsMetaReturn } from '../../src/@types/engine/UseFamousStarsMetaReturn';

const MOCK_META: readonly FamousStarMetaEntry[] = [
  {
    id: 'sun',
    names: ['The Sun', 'Sol'],
    constellation: '—',
    spectralType: 'G2 V',
    distancePc: 0.0000048,
    magV: -26.74,
    absMag: 4.83,
    radiusSolar: 1,
    temperatureK: 5772,
    massSolar: 1,
    luminositySolar: 1,
    ageGyr: 4.6,
    description:
      'Our home star, a middle-aged yellow-dwarf about halfway through its main-sequence life. It holds 99.86% of the mass of the Solar System and drives every process on Earth.',
  },
  {
    id: 'betelgeuse',
    names: ['Betelgeuse', 'Alpha Orionis'],
    constellation: 'Orion',
    spectralType: 'M1-M2 Ia-ab',
    distancePc: 168,
    magV: 0.42,
    absMag: -5.85,
    radiusSolar: 764,
    temperatureK: 3600,
    massSolar: 16.5,
    luminositySolar: 126000,
    ageGyr: 0.01,
    variable: { type: 'Semiregular', magRange: [0.0, 1.6] },
    description:
      'A red supergiant nearing the end of its life, one of the largest stars visible to the naked eye. Its brightness swells and fades over months as the bloated envelope pulses, and it is expected to end as a supernova.',
  },
  {
    id: 'sirius',
    names: ['Sirius', 'Alpha Canis Majoris', 'Dog Star'],
    constellation: 'Canis Major',
    spectralType: 'A1 V',
    distancePc: 2.64,
    magV: -1.46,
    absMag: 1.42,
    radiusSolar: 1.71,
    temperatureK: 9940,
    massSolar: 2.06,
    luminositySolar: 25.4,
    ageGyr: 0.24,
    description:
      'The brightest star in the night sky, a hot main-sequence star only 8.6 light-years away, orbited by a faint white-dwarf companion.',
  },
  {
    id: 'vega',
    names: ['Vega', 'Alpha Lyrae'],
    constellation: 'Lyra',
    spectralType: 'A0 V',
    distancePc: 7.68,
    magV: 0.03,
    absMag: 0.58,
    radiusSolar: 2.36,
    temperatureK: 9600,
    massSolar: 2.14,
    luminositySolar: 40.1,
    ageGyr: 0.45,
    oblateness: 0.23,
    description:
      'A nearby blue-white star that served as the historical zero point of the magnitude scale. It rotates so fast it is noticeably flattened, and hosts a dusty debris disk.',
  },
];

export function useFamousStarsMeta(): UseFamousStarsMetaReturn {
  return { famousStarsMeta: MOCK_META, ready: true };
}
