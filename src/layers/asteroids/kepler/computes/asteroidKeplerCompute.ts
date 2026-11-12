/**
 * asteroidKeplerCompute — the PRELUDE solve of every row's heliocentric position, ahead of the dot
 * pass that reads it on the POST_FOREGROUND line. Gate: the same `asteroidsDrawn` as the pass.
 */
import type { ContentCompute } from '../../../../@types/engine/frame/ContentCompute';
import type { AsteroidsRuntime } from '../../@types/AsteroidsRuntime';
import { asteroidsDrawn } from '../utils/asteroidsDrawn';

export function asteroidKeplerCompute(runtime: AsteroidsRuntime): ContentCompute<'asteroids'> {
  return {
    name: 'asteroid-kepler',
    scope: 'once',
    fade: 'asteroids',
    encode(encoder, ctx, _state, claimTimestampWrites, fade) {
      const { simDays } = ctx.snapshot;
      if (!asteroidsDrawn(fade, simDays)) return;
      runtime.solver.encode(encoder, simDays, claimTimestampWrites);
    },
  };
}
