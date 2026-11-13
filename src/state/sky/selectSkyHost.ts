/** selectSkyHost — the terrain host the camera is on (its body, site or spot), else Earth: where typed coordinates stand (D10). */
import type { RootState } from '../../store/types';
import type { SceneBodyId } from '../../@types/scene/SceneBodyId';
import type { FramedCameraPose } from '../../@types/camera/pose/FramedCameraPose';
import { selectCameraBase } from '../camera/selectors';
import { SKY_HOSTS } from '../../data/sky/skyHosts';
import { SURFACE_FIXED_SITES } from '../../data/bodies/surfaceFixedSites';
import { asSceneBodyId } from '../../utils/scene/asSceneBodyId';
import { isBodyArm } from '../../services/engine/camera/arms/body/isBodyArm';
import { isSiteArm } from '../../services/engine/camera/arms/site/isSiteArm';
import { isSkyArm } from '../../services/engine/camera/arms/sky/isSkyArm';

const EARTH = asSceneBodyId('earth');

function bodyUnder(base: FramedCameraPose): SceneBodyId | null {
  if (isBodyArm(base)) return base.pose.bodyId;
  if (isSkyArm(base)) return base.frame.sky.body;
  if (isSiteArm(base))
    return SURFACE_FIXED_SITES.find((s) => s.id === base.pose.siteId)?.hostId ?? null;
  return null;
}

export const selectSkyHost = (state: RootState): SceneBodyId => {
  const body = bodyUnder(selectCameraBase(state));
  return body !== null && SKY_HOSTS.has(body) ? body : EARTH;
};
