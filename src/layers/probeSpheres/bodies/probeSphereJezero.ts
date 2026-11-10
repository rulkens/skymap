import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { probeSphereBody } from './makers/probeSphereBody';
import { PROBE_SPHERE_RADIUS_M } from '../spheres/data/probeSphereRadiusM';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { asSurfaceSiteId } from '../../../utils/scene/asSurfaceSiteId';

/** In Jezero crater, ~300 m east of Perseverance: inside the HiRISE terrain band the rover's site
 * keeps baked, which the landing site (13 km east) is not. Seated as `probeSphereSoendermarken`. */
export const PROBE_SPHERE_JEZERO: LayerBody = {
  body: probeSphereBody('probe-sphere-jezero', 'Probe sphere (Jezero)'),
  position: {
    kind: 'site',
    site: {
      id: asSurfaceSiteId('probe-sphere-jezero'),
      hostId: asSceneBodyId('mars'),
      latDeg: 18.43687,
      lonDeg: 77.23739,
      altitudeM: PROBE_SPHERE_RADIUS_M,
      seat: 'resting',
    },
  },
};
