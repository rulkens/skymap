/**
 * surveyOrbit — galaxies filling the frame in every direction, orbited once at
 * constant speed from inside the SDSS volume, so walls and filaments of single
 * points read in 3D and the rotation shows off how smoothly it renders. One
 * linear revolution, so the video loops.
 *
 * Orbits a point 250 Mpc out (the Cosmic Web exhibit's framing), not us: every
 * flux-limited survey is densest around its observer, so an orbit centred on
 * the Milky Way only ever shows one blown-out core.
 */

import type { Clip } from '../../../@types/animation/Clip';
import { fork, hide, oscillate, spin } from '../../../services/engine/animation/effectHelpers';
import { COSMIC_WEB_POSE } from '../../../compositions/exhibits/cosmicWebPose';

const PERIOD_SEC = 32;

export const surveyOrbit: Clip = {
  id: 'surveyOrbit',
  label: 'Inside the survey, orbit',
  data: {
    start: COSMIC_WEB_POSE,
    timeline: [
      hide(['labels', 'structureRing', 'cosmicWebDensity', 'zoneOfAvoidance'], 0),
      fork(oscillate('pitch', { amp: 0.1, period: PERIOD_SEC })),
      spin('yaw', { by: Math.PI * 2, over: PERIOD_SEC, ease: 'linear' }),
    ],
  },
};
