// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { PROBE_SPHERE_IDS } from './spheres/data/probeSphereIds';
import { PROBE_SPHERE_ORBIT } from './bodies/probeSphereOrbit';
import { PROBE_SPHERE_SOENDERMARKEN } from './bodies/probeSphereSoendermarken';
import { PROBE_SPHERE_JEZERO } from './bodies/probeSphereJezero';

// `bodies` is the whole off switch: an uncovered sphere is out of the frame's scene bodies (no
// draw, pick or probe capture), and its mesh row demands only while its item shows.
export const probeSpheresVisibility = [
  {
    key: 'probeSpheres',
    items: PROBE_SPHERE_IDS,
    bodies: {
      'probe-sphere-orbit': [PROBE_SPHERE_ORBIT.body],
      'probe-sphere-soendermarken': [PROBE_SPHERE_SOENDERMARKEN.body],
      'probe-sphere-jezero': [PROBE_SPHERE_JEZERO.body],
    },
  },
] as const satisfies readonly VisibilityEntry[];
