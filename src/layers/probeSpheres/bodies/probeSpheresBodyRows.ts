import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { PROBE_SPHERE_ORBIT } from './probeSphereOrbit';
import { PROBE_SPHERE_SOENDERMARKEN } from './probeSphereSoendermarken';
import { PROBE_SPHERE_JEZERO } from './probeSphereJezero';

export const PROBE_SPHERES_BODY_ROWS: readonly LayerBody[] = [
  PROBE_SPHERE_ORBIT,
  PROBE_SPHERE_SOENDERMARKEN,
  PROBE_SPHERE_JEZERO,
];
