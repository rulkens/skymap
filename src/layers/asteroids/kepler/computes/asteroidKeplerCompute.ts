/**
 * asteroidKeplerCompute — the PRELUDE solve and cull of every row, ahead of the dot pass that draws
 * the kept list on the POST_FOREGROUND line. Gate: the same `asteroidsDrawn` as the pass. The cull
 * uses the frame's eye; a stereo or dome view's own eye only moves where a kept dot lands. The lift
 * keys on `cam.distance`, the eye-to-target range: how far out the view frames, wherever the eye sits.
 */
import type { ContentCompute } from '../../../../@types/engine/frame/ContentCompute';
import type { AsteroidsRuntime } from '../../@types/AsteroidsRuntime';
import { SELECTION_NONE_SENTINEL } from '../../../../data/selectionEncoding';
import { asteroidsDrawn } from '../utils/asteroidsDrawn';
import { asteroidSunFromCamAu } from '../utils/asteroidSunFromCamAu';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { ASTEROID_CLASSES } from '../../../../data/asteroids/asteroidClasses';
import { ASTEROID_FORMAT } from '../../../../data/asteroids/asteroidFormat';
import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import { asteroidExposureRamp } from '../../points/utils/asteroidExposureRamp';
import { selectedAsteroidRows } from '../../selection/utils/selectedAsteroidRows';
import { asteroidKeptFraction } from '../utils/asteroidKeptFraction';
import { asteroidHLimitCenti } from '../utils/asteroidHLimitCenti';

export function asteroidKeplerCompute(runtime: AsteroidsRuntime): ContentCompute<'asteroids'> {
  return {
    name: 'asteroid-kepler',
    scope: 'once',
    fade: 'asteroids',
    encode(encoder, ctx, state, claimTimestampWrites, fade) {
      const { simDays } = ctx.snapshot;
      if (!asteroidsDrawn(fade, simDays)) return;
      const sunFromCamAu = asteroidSunFromCamAu(ctx.drawCamPos);
      const catalog = runtime.slot.current()?.catalog;
      const selectedRow = catalog ? selectedAsteroidRows(state.selection, catalog)[0] : undefined;
      const tuning = state.settings.asteroidTuning;
      const zoomAu = ctx.cam.distance / SCALE_UNITS.AU_TO_MPC;
      const byClass = catalog?.hCentiByClass;
      const kept = byClass ? asteroidKeptFraction(byClass, fade, zoomAu, tuning) : 1;
      runtime.solver.encode(
        encoder,
        {
          simJd: simDays,
          sunFromCamAu,
          exposure: asteroidExposureRamp(zoomAu, tuning) * state.settings.asteroids.brightness,
          classFade: fade,
          hLimitCenti: Object.fromEntries(
            ASTEROID_CLASSES.map((cls) => [
              cls,
              byClass ? asteroidHLimitCenti(byClass[cls], kept) : ASTEROID_FORMAT.hNone,
            ]),
          ) as Record<AsteroidClass, number>,
          selectedRow: selectedRow ?? SELECTION_NONE_SENTINEL,
          minFlux: 10 ** (-0.4 * tuning.limitingMag),
          maxPhaseDimMag: tuning.maxPhaseDimMag,
        },
        claimTimestampWrites,
      );
    },
  };
}
