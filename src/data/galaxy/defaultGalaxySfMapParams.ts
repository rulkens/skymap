/**
 * First hand-calibrated pass at the SSPSF automaton (user, 2026-08-02), not a
 * measurement — every value here was found by eye against the overlay.
 *
 * The three ignition terms are all PER-STEP PROBABILITIES summed into one `p`,
 * so each is far smaller than intuition suggests.
 *
 * `spread` has a derivable LOWER bound, not a derivable value: `p` is evaluated
 * at the RECEIVER over a Moore 8-neighbourhood, so mean offspring is
 * `N_eligible * spread`. With all eight eligible that puts criticality at 1/8 =
 * 0.125 — but the refractory gate and gas depletion make the cells behind a
 * front ineligible, so only its leading edge propagates and the true threshold
 * is higher. Gerola & Seiden's ~0.18 is 1/6, the same law for their 6-cell
 * equal-area neighbourhood, NOT a value to copy across.
 *
 * `armForcing` is a bias, not a driver: at 0.15 an arm cell ignited with 15%
 * probability per step from forcing ALONE, saturating the arms whatever
 * `spread` did.
 */
import type { GalaxySfMapParams } from '../../@types/galaxy/GalaxySfMapParams';

export const DEFAULT_GALAXY_SF_MAP_PARAMS: GalaxySfMapParams = {
  enabled: true,
  // A 2D front covers ~n^2 cells in n steps where the old ring-trapped 1D one
  // covered ~n, so the material-frame automaton reaches the same structure in
  // far fewer iterations — and rebuild latency is linear in this.
  steps: 100,
  baseIgnition: 0.0002,
  // 1/8 is a LOWER BOUND on criticality, not the value: it assumes all eight
  // neighbours are eligible, but in a real front the cells behind it are
  // refractory and gas-depleted, so only the leading edge can ignite and the
  // effective branching ratio is roughly half. Found by eye at 0.164, which is
  // consistent with an eligible neighbourhood of ~4-5 rather than 8.
  spread: 0.164,
  refractorySteps: 7,
  gasRegen: 0.06,
  // A light touch: the arms only need to bias the automaton, not drive it.
  // Raising this washes out the emergent inter-arm structure the tier exists
  // for, leaving the ridge redrawn as a fuzzy band.
  armForcing: 0.015,
  // ~13 kpc at 1.6667 kpc/unit — inside the 17.5 kpc disc, so both shear
  // senses appear on screen. The Milky Way's own corotation is contested well
  // beyond this precision; it is a knob, not a measurement.
  corotationRadius: 7.9,
  shearRate: 0.16,
  // Forcing saturates to full strength once |shear| reaches this many
  // texels/step. At the defaults above that puts the half-strength crossing
  // at r ~ 7.2 and ~8.8 — a deficit band a couple units wide around
  // corotationRadius, not the whole disc (a hard clamp at 1 texel/step
  // would span r ~ 5.6-12.6).
  armFluxRef: 0.5,
  // Formerly OLD_ACTIVITY_DECAY/OLD_ACTIVITY_GAIN consts in sfMapStep.wesl,
  // now live sliders — these two values reproduce that build's behaviour
  // exactly, so promoting them to params is behaviour-neutral by itself.
  activityDecay: 0.985,
  activityGain: 0.15,
};
