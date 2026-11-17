import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { probeSphereBody } from './makers/probeSphereBody';
import { PROBE_SPHERE_RADIUS_M } from '../spheres/data/probeSphereRadiusM';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { asSurfaceSiteId } from '../../../utils/scene/asSurfaceSiteId';

/** At the Søndermarken scan's centre. A `resting` seat with one radius of lift puts its bottom
 * on the highest baked ground under it (`buildSiteGroundHeights`). */
export const PROBE_SPHERE_SOENDERMARKEN: LayerBody = {
  body: probeSphereBody('probe-sphere-soendermarken', 'Probe sphere (Søndermarken)'),
  position: {
    kind: 'site',
    site: {
      id: asSurfaceSiteId('probe-sphere-soendermarken'),
      hostId: asSceneBodyId('earth'),
      latDeg: 55.670015,
      lonDeg: 12.524611,
      altitudeM: PROBE_SPHERE_RADIUS_M,
      seat: 'resting',
    },
  },
};
