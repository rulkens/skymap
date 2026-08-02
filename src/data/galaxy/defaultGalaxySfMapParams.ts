/**
 * First hand-calibrated pass at the SSPSF automaton (user, 2026-08-02), not a
 * measurement — every value here was found by eye against the overlay.
 *
 * The one number that carries information beyond taste is `spread`. The
 * percolation threshold in THIS implementation sits far above the classical
 * ~0.18: below roughly 0.5 the structure dies within a few steps and nothing
 * visible happens. The suspect is gas starvation rather than the propagation
 * rule — a cell leaves `refractorySteps` with only `refractorySteps * gasRegen`
 * of its gas back (0.42 here), so ignition is competing against a floor the
 * classical model does not have. Tune `spread` against `gasRegen` and
 * `refractorySteps` together; moving one alone will look like the knob is dead.
 */
import type { GalaxySfMapParams } from '../../@types/galaxy/GalaxySfMapParams';

export const DEFAULT_GALAXY_SF_MAP_PARAMS: GalaxySfMapParams = {
  enabled: true,
  steps: 300,
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
