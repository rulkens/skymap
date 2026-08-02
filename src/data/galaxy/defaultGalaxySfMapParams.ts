/**
 * First hand-calibrated pass at the SSPSF automaton (user, 2026-08-02), not a
 * measurement — every value here was found by eye against the overlay.
 *
 * `spread` 0.56 is PRE-REFRAME and expected to fall toward the classical ~0.18.
 * It was calibrated while the automaton resampled discrete state bilinearly, so
 * a lone ignition was invisible to its neighbours and 0.56 was buying adjacent
 * PAIRS by chance rather than buying propagation (research doc's sf-map.md).
 * An earlier docblock here blamed gas starvation; the user's own test —
 * `gasRegen` 1.0 with `spread` 0.18 — refuted that, so do not re-tune against it.
 */
import type { GalaxySfMapParams } from '../../@types/galaxy/GalaxySfMapParams';

export const DEFAULT_GALAXY_SF_MAP_PARAMS: GalaxySfMapParams = {
  enabled: true,
  // A 2D front covers ~n^2 cells in n steps where the old ring-trapped 1D one
  // covered ~n, so the material-frame automaton reaches the same structure in
  // far fewer iterations — and rebuild latency is linear in this.
  steps: 100,
  baseIgnition: 0.002,
  spread: 0.56,
  refractorySteps: 7,
  gasRegen: 0.06,
  // A light touch: the arms only need to bias the automaton, not drive it.
  // Raising this washes out the emergent inter-arm structure the tier exists
  // for, leaving the ridge redrawn as a fuzzy band.
  armForcing: 0.15,
  // ~13 kpc at 1.6667 kpc/unit — inside the 17.5 kpc disc, so both shear
  // senses appear on screen. The Milky Way's own corotation is contested well
  // beyond this precision; it is a knob, not a measurement.
  corotationRadius: 7.9,
  shearRate: 0.16,
};
