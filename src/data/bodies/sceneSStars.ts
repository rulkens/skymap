/**
 * sceneSStars — the 40 bound S-stars as DRAWN records: each seed's identity
 * paired with the appearance derived from its apparent K magnitude.
 *
 * The seed table (`sStarElements`) carries astrometry and photometry in
 * Gillessen's published units; `sStarAppearance` turns the K magnitude and the
 * early/late flag into the temperature, absolute magnitude and radius a
 * `StarBody` needs. Composed here rather than in the seed table so the
 * transcription stays a transcription.
 *
 * No position: a `StarBody` carries none. An S-star's is Keplerian about
 * Sgr A\*, so it comes from `ORBITAL_ELEMENTS` through the per-frame
 * `deriveBodyStates` snapshot — which is why this table is inert until those
 * element rows are wired in.
 *
 * A SECOND seed table beside `SCENE_STARS`, deliberately never merged: the
 * packed pick id is an index into one table, so appending would renumber every
 * famous star and invalidate saved selections.
 */

import { S_STAR_SEEDS } from './sStarElements';
import { sStarAppearance } from './sStarAppearance';
import { SCALE_UNITS } from '../scaleUnits';
import { SOLAR_RADIUS_KM } from './solarRadiusKm';
import { temperatureToLinearRgb } from '../../utils/color/temperatureToLinearRgb';
import type { StarBody } from '../../@types/scene/StarBody';

export const SCENE_S_STARS: readonly StarBody[] = S_STAR_SEEDS.map((seed) => {
  const { temperatureK, absMag, radiusSolar } = sStarAppearance(seed.kMag, seed.spectralClass);
  return {
    id: seed.id,
    label: seed.label,
    absMag,
    color: temperatureToLinearRgb(temperatureK),
    // Wire/authored value is km; runtime convention is metres.
    radiusM: radiusSolar * SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M,
  };
});
