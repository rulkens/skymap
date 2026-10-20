/**
 * Hubble, geocentric.
 */

import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { meshBody } from '../../../data/bodies/makers/meshBody';
import { orbiter } from '../../../data/bodies/makers/orbiter';
import { HUBBLE_SILVER } from '../../../data/bodies/palette';

export const HUBBLE: LayerBody = {
  // `presentFromIso`: Hubble's release from Discovery's arm.
  body: meshBody({
    id: 'hubble',
    label: 'Hubble',
    meshKey: 'hubble',
    presentFromIso: '1990-04-25T19:38:00Z',
  }),
  position: {
    kind: 'orbit',
    // Columns verbatim from JPL Horizons ELEMENTS (`-48`,
    // CENTER='500@399', REF_PLANE='FRAME', OUT_UNITS='KM-D') at JDTDB 2461298.5 =
    // 2026-Sep-15 00:00 TDB, and the node rate is the mean of two 5-day `OM`
    // steps over the same span. The refresh query is recorded in
    // `data/raw/meshes/hubble/README.md`.
    elements: orbiter({
      id: 'hubble',
      focusId: 'earth',
      epochJd: 2461298.5,
      semiMajorKm: 6852.132959105691,
      eccentricity: 2.423931415351075e-4,
      inclinationDeg: 28.45103713579995,
      ascendingNodeDeg: 185.7242679199093,
      argPeriapsisDeg: 189.2459336243418,
      meanAnomalyDeg: 51.61232139214808,
      meanMotionDegPerDay: 5510.190163541656,
      // OM 185.7242679 → 151.4846789 → 117.4543700 over 2026-09-15/20/25.
      nodeRateDegPerDay: -6.827,
      poleRaDeg: 270,
      poleDecDeg: 90,
      color: HUBBLE_SILVER,
    }),
  },
  // Hubble holds an inertial attitude, but WHICH one is the observing schedule's
  // business, so this one is authored: aperture (+X) on the celestial north pole
  // — the one direction a 28.5°-inclined orbit never puts the Earth in front of
  // — and the solar-array long axis (+Z, the pole here) on the equinox. Ẇ = 0.
  rotation: {
    id: 'hubble',
    poleRaDeg: 0.0,
    poleDecDeg: 0.0,
    primeMeridianDeg: 90.0,
    spinRateDegPerDay: 0,
  },
};
