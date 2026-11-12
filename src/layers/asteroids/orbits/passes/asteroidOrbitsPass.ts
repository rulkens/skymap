/**
 * asteroidOrbitsPass — the focused and selected asteroids' orbits as the same fading trail the
 * planets get, drawn by the Layer's OWN `OrbitTrailRenderer`: core's rewrites its instance buffer on
 * every `draw`, so a second draw in a frame would overwrite the planets' records before submit.
 * Alpha is the class fade times `asteroidWindowFade`. NEAR0, under the trails' occlusion; no pick.
 */
import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { AsteroidsRuntime } from '../../@types/AsteroidsRuntime';
import type { OrbitTrail } from '../../../../@types/rendering/orbitTrailRenderer/OrbitTrail';
import { drawOrbitConics } from '../../../../services/engine/frame/drawOrbitConics';
import { orbitTrailView } from '../../../../services/engine/frame/orbitTrailView';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { asteroidClassOf } from '../../catalog/utils/asteroidClassOf';
import { asteroidWindowFade } from '../../kepler/utils/asteroidWindowFade';
import { selectedAsteroidRows } from '../../selection/utils/selectedAsteroidRows';
import { asteroidOrbitTrail } from '../utils/asteroidOrbitTrail';

export function asteroidOrbitsPass(runtime: AsteroidsRuntime): ContentPass<'asteroids'> {
  return {
    name: 'asteroid-orbits',
    fade: 'asteroids',

    enabled(state, ctx) {
      const catalog = runtime.slot.current()?.catalog;
      if (catalog === undefined || asteroidWindowFade(ctx.snapshot.simDays) === 0) return false;
      return selectedAsteroidRows(state.selection, catalog).length > 0;
    },

    draw(pass, view, ctx, state, fade) {
      const catalog = runtime.slot.current()!.catalog;
      const { simDays } = ctx.snapshot;
      const windowFade = asteroidWindowFade(simDays);
      const trails: OrbitTrail[] = [];
      for (const k of selectedAsteroidRows(state.selection, catalog)) {
        const cls = asteroidClassOf(catalog, k);
        const classFade = fade[cls];
        if (classFade === 0) continue;
        trails.push(
          asteroidOrbitTrail(
            catalog,
            k,
            simDays,
            RENDER_ORIGIN_MPC,
            state.settings.asteroidTuning.colors[cls],
            classFade * windowFade,
          ),
        );
      }
      drawOrbitConics(pass, runtime.orbitRenderer, trails, orbitTrailView(view, ctx, state));
    },
  };
}
