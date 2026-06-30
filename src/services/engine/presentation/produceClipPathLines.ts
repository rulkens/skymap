/**
 * createClipPathLinesProducer — debug overlay LabelProducer that draws the most
 * recent flyPath's eye route as an in-scene polyline.
 *
 * Tuning a camera flythrough from the moving camera alone is guesswork; seeing
 * the spline laid out in the scene makes "are we on the right track?" answerable
 * at a glance. This producer reads the active clip's compiled `pathTracks` from
 * the clip player and emits the eye polyline (via `buildClipPathLines`) as
 * marker lines. It contributes no labels.
 *
 * ### Why it PERSISTS the last path
 *
 * The route is only worth looking at when you're NOT flying it — while the clip
 * plays the camera rides the line and can't see its shape. So the producer
 * caches the last compiled route and keeps drawing it after the clip ends: play
 * once, let it finish (or stop it), then free-orbit around the frozen line to
 * inspect it. A replay refreshes the cache; playing a non-path clip clears it.
 * (A future `debug.showClipPath` toggle can gate this; today it is implicitly
 * scoped to "you played a flyPath at least once".)
 *
 * The closure cache is why this is a factory, not a bare function — the
 * `LabelProducer` contract is pure-of-state, but a per-instance `lastLines`
 * holds across frames without leaking into module scope.
 *
 * Never signals `awake`: the path geometry is static once compiled. Drawing the
 * frozen line while idle needs no loop wake of its own — orbiting to inspect it
 * already wakes the loop via pointer events.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { LabelProducerOutput } from '../../../@types/engine/subsystems/LabelProducerOutput';
import type { MarkerLine } from '../../../@types/rendering/MarkerLine';
import { buildClipPathLines } from './buildClipPathLines';

export function createClipPathLinesProducer(): (
  state: EngineState,
  ctx: ReadyFrameContext,
) => LabelProducerOutput {
  // Survives across frames: the last flyPath route, kept on screen after the
  // clip ends so it can be inspected from a free camera.
  let lastLines: MarkerLine[] = [];

  return (state: EngineState, _ctx: ReadyFrameContext): LabelProducerOutput => {
    const compiled = state.subsystems.clipPlayer.currentCompiled();
    if (compiled) {
      // A clip is active: refresh from its path, or clear if it carries none
      // (a non-flyPath clip is playing — drop the stale route).
      lastLines = compiled.pathTracks.length > 0 ? buildClipPathLines(compiled.pathTracks) : [];
    }
    // Idle (compiled === null): keep showing the last route for inspection.
    return { labels: [], lines: lastLines, awake: false };
  };
}
