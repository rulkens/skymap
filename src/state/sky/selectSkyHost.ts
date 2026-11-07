/** selectSkyHost — the terrain host the camera is on (its body, site or spot), else Earth: where typed coordinates stand (D10). */
import type { RootState } from '../../store/types';
import type { SceneBodyId } from '../../@types/scene/SceneBodyId';
import { selectCameraBase } from '../camera/selectors';
import { SKY_HOSTS } from '../../data/sky/skyHosts';
import { SURFACE_FIXED_SITES } from '../../data/bodies/surfaceFixedSites';
import { asSceneBodyId } from '../../utils/scene/asSceneBodyId';

const EARTH = asSceneBodyId('earth');

export const selectSkyHost = (state: RootState): SceneBodyId => {
  const { frame } = selectCameraBase(state);
  const body =
    frame === 'absolute'
      ? null
      : 'body' in frame
        ? frame.body
        : 'sky' in frame
          ? frame.sky.body
          : (SURFACE_FIXED_SITES.find((s) => s.id === frame.site)?.hostId ?? null);
  return body !== null && SKY_HOSTS.has(body) ? body : EARTH;
};
