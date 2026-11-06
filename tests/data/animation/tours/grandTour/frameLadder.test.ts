/**
 * grandTour frame ladder — the EFFECTIVE `settings.orientation` the tour runs
 * each beat under, not the raw `frameTo` literals.
 *
 * A literal restatement of the authored `frameTo(...)` calls against each
 * clip's timeline cannot catch a bug in how that content gets APPLIED: the
 * Critical this suite guards is `tourBodySaga`'s beat-boundary `mergeSnapshot`
 * reverting `settings.orientation` to its pre-tour value at every beat
 * boundary, even though the `frameTo` literals themselves stay correct. Per
 * the project's testing convention (a test must be able to fail on a real
 * bug no other test or compiler check catches), that restatement wouldn't
 * earn its place.
 *
 * This version drives the two production mechanisms `tourBodySaga` composes
 * at every beat boundary — the reconstruction fold (`computeSceneEntering` →
 * `mergeSnapshot`, copied verbatim from `tourBodySaga.ts`) and the beat's
 * own cues actually firing (`applySceneEffect`, the same dispatch table
 * `clipPlayer` calls from) — against the REAL `grandTour` beats, and asserts
 * the resulting `settings.orientation` after each beat.
 *
 * Deliberately NOT run through `tourBodySaga`/`visitBeatSaga` end to end:
 * a real playthrough gates every beat's fly behind `resolveClipFoci`, which
 * needs real loaded catalog / famous-galaxy / structure data for every
 * id-bearing cue in EVERY beat (Local Group members, Virgo, Laniakea, …) —
 * orthogonal to which pole is "up", and fabricating that fixture would dwarf
 * the test it supports. Firing a beat's scene cues directly via
 * `applySceneEffect` reproduces exactly what a real playthrough eventually
 * dispatches for them (`compileClip`'s flattened, atSec-sorted `cues` list),
 * without needing camera-motion resolution at all.
 */
import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../../../src/store/rootReducer';
import { grandTour } from '../../../../../src/data/animation/tours/grandTour';
import { approachM31 } from '../../../../../src/data/animation/tours/grandTour/approachM31';
import { earthAndMoon } from '../../../../../src/data/animation/tours/grandTour/earthAndMoon';
import { youAreHere } from '../../../../../src/data/animation/tours/grandTour/youAreHere';
import { frameTo } from '../../../../../src/services/engine/animation/effectHelpers';
import { mergeSnapshot } from '../../../../../src/state/settings/mergeSnapshotAction';
import { mergeSettingsSnapshot } from '../../../../../src/state/settings/mergeSettingsSnapshot';
import { computeSceneEntering } from '../../../../../src/state/tour/computeSceneEntering';
import { captureScene } from '../../../../../src/state/scene/captureScene';
import { applySceneEffect } from '../../../../../src/services/animation/applySceneEffect';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { SceneEffect } from '../../../../../src/@types/animation/SceneEffect';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { OrientationFrameId } from '../../../../../src/@types/camera/orientation/OrientationFrameId';
import type { RootState } from '../../../../../src/store/types';

/**
 * Walk a clip's effect tree in authored order and collect its `frameTo`
 * leaves — the tree-order equivalent of `compileClip`'s flat, atSec-sorted
 * `cues` list, narrowed to the one cue kind that can move `settings.orientation`.
 * `show`/`hide`/`focus` also route through `applySceneEffect`, but firing them
 * for real needs a live `state.subsystems.fades` (the visibility sync) —
 * standing that up would drag in the whole fade/subsystem wiring for cues this
 * test has no interest in. `frameTo` alone determines the orientation ladder,
 * so only it needs firing.
 *
 * Unlike `compileClip`, this never touches the unresolved id-bearing motion
 * arms (`moveTargetId`, `focusId`, …) — it simply never looks at them — which
 * is why it can run on the RAW authored beats without `resolveClipFoci` first
 * (`compileClip` throws on those).
 */
function collectFrameToEffects(effects: readonly Effect[]): SceneEffect[] {
  const out: SceneEffect[] = [];
  for (const e of effects) {
    if (e.kind === 'seq' || e.kind === 'all') out.push(...collectFrameToEffects(e.children));
    else if (e.kind === 'fork') out.push(...collectFrameToEffects([e.child]));
    else if (e.kind === 'frameTo') out.push(e);
  }
  return out;
}

function makeStore() {
  return configureStore({ reducer: rootReducer });
}

/**
 * Fire every `frameTo` cue of a clip, in authored order, through the REAL
 * `applySceneEffect` dispatch table — the same function `clipPlayer` calls
 * cue-by-cue during real playback.
 *
 * The `cameraRuntime` stub only needs to satisfy `frameTo`'s
 * `liveUpBasisQuat` read (`outputs.upBasis`, an identity Mat3 is fine —
 * the roll's seed quaternion is not under test here).
 */
function fireFrameToCues(store: ReturnType<typeof makeStore>, clip: ClipData | undefined): void {
  if (clip === undefined) return;
  const state = {
    settings: store.getState().settings,
    cameraRuntime: { outputs: { upBasis: [1, 0, 0, 0, 1, 0, 0, 0, 1] } },
  } as unknown as EngineState;
  for (const effect of collectFrameToEffects(clip.timeline)) {
    applySceneEffect(effect, { state, store });
  }
}

const POLES: readonly OrientationFrameId[] = [
  'equatorial',
  'ecliptic',
  'galactic',
  'supergalactic',
];

/**
 * docs/tour/implementation-notes.md's frame ladder: galactic over the park and
 * the rise, ecliptic for the Earth beats from Earth and Moon (the Moon and the
 * planets orbit near it), galactic again for the Milky Way, supergalactic from
 * the M31 approach outward, and galactic for the landing (homeAgain's dwell).
 * Found by clip, not index, so beats can land in between.
 */
function ladderPole(i: number): OrientationFrameId {
  const beats = grandTour.beats;
  const earthAndMoonAt = beats.findIndex((b) => b.enterClip === earthAndMoon);
  const milkyWayAt = beats.findIndex((b) => b.enterClip === youAreHere);
  const m31At = beats.findIndex((b) => b.enterClip === approachM31);
  if (i === beats.length - 1) return 'galactic';
  if (i >= m31At) return 'supergalactic';
  if (i >= milkyWayAt) return 'galactic';
  return i >= earthAndMoonAt ? 'ecliptic' : 'galactic';
}

describe('grand tour frame ladder — effective orientation per beat', () => {
  it('runs each beat under the pole set by its own (or an earlier) frameTo cue, never reverted at a beat boundary', () => {
    const store = makeStore();
    const snapshot = captureScene(store.getState() as RootState, 0);

    const orientationPerBeat: OrientationFrameId[] = [];
    for (let i = 0; i < grandTour.beats.length; i++) {
      // The exact beat-boundary dispatch tourBodySaga performs at the top
      // of every loop iteration (tourBodySaga.ts) — a raw write here would sweep
      // `orientation` back to `snapshot`'s pre-tour value on every beat.
      const live = store.getState().settings;
      const baseline = mergeSettingsSnapshot(live, snapshot.settings);
      store.dispatch(mergeSnapshot(computeSceneEntering(baseline, grandTour.beats, i)));

      // The beat "plays": fire its real frameTo cues, enter then dwell — the
      // order clipPlayer fires them in.
      const beat = grandTour.beats[i]!;
      fireFrameToCues(store, beat.enterClip);
      fireFrameToCues(store, beat.dwellClip);

      orientationPerBeat.push(store.getState().settings.orientation);
    }

    expect(grandTour.beats.length - 1).toBeGreaterThanOrEqual(9);
    orientationPerBeat.forEach((pole, i) => expect(pole).toBe(ladderPole(i)));
  });

  it('runs each beat up to the M31 approach under its pole when entered cold (a skip or Prev)', () => {
    const m31 = grandTour.beats.findIndex((b) => b.enterClip === approachM31);
    for (let i = 0; i <= m31; i++) {
      for (const before of POLES) {
        const store = makeStore();
        const snapshot = captureScene(store.getState() as RootState, 0);
        // Whatever pole the beat before left live.
        fireFrameToCues(store, { start: 'live', timeline: [frameTo(before, { over: 0 })] });
        const baseline = mergeSettingsSnapshot(store.getState().settings, snapshot.settings);
        store.dispatch(mergeSnapshot(computeSceneEntering(baseline, grandTour.beats, i)));
        fireFrameToCues(store, grandTour.beats[i]!.enterClip);
        fireFrameToCues(store, grandTour.beats[i]!.dwellClip);
        expect([i, before, store.getState().settings.orientation]).toEqual([
          i,
          before,
          ladderPole(i),
        ]);
      }
    }
  });
});
