/**
 * satelliteOrbitsPass — the selected and focused satellites' orbits as the same fading trail the
 * planets get, drawn by the Layer's OWN `OrbitTrailRenderer`: core's rewrites its instance buffer on
 * every `draw`, so a second draw in a frame would overwrite the planets' records before submit.
 * Alpha is the class fade (its `nearEarth` band included) times `satelliteLayerOpacity`. NEAR0,
 * under the same occlusion as the trails; no pick.
 */
import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { SatellitesRuntime } from '../../@types/SatellitesRuntime';
import type { OrbitTrail } from '../../../../@types/rendering/orbitTrailRenderer/OrbitTrail';
import { drawOrbitConics } from '../../../../services/engine/frame/drawOrbitConics';
import { orbitTrailView } from '../../../../services/engine/frame/orbitTrailView';
import { sceneBodyStates } from '../../../../services/engine/frame/sceneBodyStates';
import { SCENE_EARTH } from '../../../../data/bodies/sceneEarth';
import { SATELLITE_CLASSES } from '../../../../data/satellites/satelliteClasses';
import { SATELLITE_PROFILES } from '../../points/data/satelliteProfiles';
import { satelliteLayerOpacity } from '../../points/subsystems/satelliteLayerOpacity';
import { satelliteOrbitEllipse } from '../subsystems/satelliteOrbitEllipse';
import { composeTemeToWorld } from '../../sweep/subsystems/composeTemeToWorld';
import { selectedSatelliteIndices } from '../subsystems/selectedSatelliteIndices';
import { satrecOf } from '../../sweep/load/satrecOf';

export function satelliteOrbitsPass(runtime: SatellitesRuntime): ContentPass<'satellites'> {
  return {
    name: 'satellite-orbits',
    fade: 'satellites',

    enabled(state, ctx) {
      const catalog = runtime.propagator.catalog();
      if (selectedSatelliteIndices(state.selection, catalog).length === 0) return false;
      return satelliteLayerOpacity(catalog, ctx.snapshot.simDays) > 0;
    },

    draw(pass, view, ctx, state, fade) {
      const earth = sceneBodyStates(state, ctx).get(SCENE_EARTH.id)!;
      const { simDays } = ctx.snapshot;
      const catalog = runtime.propagator.catalog()!;
      const opacity = satelliteLayerOpacity(catalog, simDays);
      const ks = selectedSatelliteIndices(state.selection, catalog);
      const temeToWorld = composeTemeToWorld(earth.orientation, simDays);

      const trails: OrbitTrail[] = [];
      for (const k of ks) {
        const classFade = fade[SATELLITE_CLASSES[catalog.classCode[k]!]!];
        if (classFade === 0) continue;
        const orbit = satelliteOrbitEllipse(
          satrecOf(catalog, k),
          catalog.epochMs[k]!,
          simDays,
          temeToWorld,
          earth.positionMpc,
        );
        if (orbit === null) continue;
        trails.push({
          ...orbit,
          color:
            state.settings.satelliteTuning.colors[SATELLITE_PROFILES[catalog.profileCodes[k]!]!.id],
          fade: classFade * opacity,
        });
      }
      drawOrbitConics(pass, runtime.orbitRenderer, trails, orbitTrailView(view, ctx, state));
    },
  };
}
