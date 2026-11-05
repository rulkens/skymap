import type { FadeBand } from '../../../../@types/math/FadeBand';
import { SCALE_UNITS } from '../../../../data/scaleUnits';

// Keyed on: CAMERA distance from the `galactic-centre` region's anchor (Sgr A*), Mpc.
// An approach fade. Engages the black-hole lens pass on close approach to Sgr A*; the
// far-field glint alpha is derived from this band (1 - fadeBand) at its call site.
export const SGR_A_STAR_LENSING_BAND: FadeBand = {
  fullAt: 100 * SCALE_UNITS.AU_TO_MPC,
  goneAt: 500 * SCALE_UNITS.AU_TO_MPC,
};
