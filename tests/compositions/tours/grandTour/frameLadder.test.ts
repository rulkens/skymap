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
 * `mergeSnapshot`, copied verbatim from `tourBodySaga.ts`) and what each beat
 * clip's `keep` end commits (its `frameTo` steps through `sceneActionsOf`, the
 * write table `sceneView` folds) — against the REAL `grandTour` beats, and
 * asserts the resulting `settings.orientation` after each beat.
 *
 * Deliberately NOT run through `tourBodySaga`/`visitBeatSaga` end to end:
 * a real playthrough gates every beat's fly behind `resolveClipFoci`, which
 * needs real loaded catalog / famous-galaxy / structure data for every
 * id-bearing cue in EVERY beat (Local Group members, Virgo, Laniakea, …) —
 * orthogonal to which pole is "up", and fabricating that fixture would dwarf
 * the test it supports. Writing a beat's `frameTo` steps directly reproduces
 * the orientation the clip player commits at each clip's end, without needing
 * camera-motion resolution at all.
 */
import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../../src/store/rootReducer';
import { grandTour } from '../../../../src/compositions/tours/grandTour';
import { approachM31 } from '../../../../src/compositions/tours/grandTour/approachM31';
import { earthAndMoon } from '../../../../src/compositions/tours/grandTour/earthAndMoon';
import { youAreHere } from '../../../../src/compositions/tours/grandTour/youAreHere';
import { frameTo } from '../../../../src/services/engine/animation/effectHelpers';
import { mergeSnapshot } from '../../../../src/state/settings/mergeSnapshotAction';
import { mergeSettingsSnapshot } from '../../../../src/state/settings/mergeSettingsSnapshot';
import { computeSceneEntering } from '../../../../src/state/tour/computeSceneEntering';
import { captureScene } from '../../../../src/state/scene/captureScene';
import { sceneActionsOf } from '../../../../src/utils/animation/sceneActionsOf';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { Effect } from '../../../../src/@types/animation/Effect';
import type { SceneEffect } from '../../../../src/@types/animation/SceneEffect';
import type { OrientationFrameId } from '../../../../src/@types/camera/orientation/OrientationFrameId';
import type { RootState } from '../../../../src/store/types';

/**
 * Walk a clip's effect tree in authored order and collect its `frameTo`
 * leaves, the one step kind that moves `settings.orientation`.
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

/** What a beat clip's `keep` end commits of its `frameTo` steps, in authored order. */
function commitFrameToSteps(store: ReturnType<typeof makeStore>, clip: ClipData | undefined): void {
  if (clip === undefined) return;
  for (const effect of collectFrameToEffects(clip.timeline)) {
    for (const action of sceneActionsOf(effect, store.getState().settings)) store.dispatch(action);
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

      // The beat "plays": enter then dwell, each committing its scene at its end.
      const beat = grandTour.beats[i]!;
      commitFrameToSteps(store, beat.enterClip);
      commitFrameToSteps(store, beat.dwellClip);

      orientationPerBeat.push(store.getState().settings.orientation);
    }

    expect(grandTour.beats.length - 1).toBeGreaterThanOrEqual(9);
    orientationPerBeat.forEach((pole, i) => expect(pole).toBe(ladderPole(i)));
  });

  it('runs each beat up to the M31 approach, and Home again, under its pole when entered cold (a skip or Prev)', () => {
    const m31 = grandTour.beats.findIndex((b) => b.enterClip === approachM31);
    const coldEntries = [...Array(m31 + 1).keys(), grandTour.beats.length - 1];
    for (const i of coldEntries) {
      for (const before of POLES) {
        const store = makeStore();
        const snapshot = captureScene(store.getState() as RootState, 0);
        // Whatever pole the beat before left live.
        commitFrameToSteps(store, { start: 'live', timeline: [frameTo(before, { over: 0 })] });
        const baseline = mergeSettingsSnapshot(store.getState().settings, snapshot.settings);
        store.dispatch(mergeSnapshot(computeSceneEntering(baseline, grandTour.beats, i)));
        commitFrameToSteps(store, grandTour.beats[i]!.enterClip);
        commitFrameToSteps(store, grandTour.beats[i]!.dwellClip);
        expect([i, before, store.getState().settings.orientation]).toEqual([
          i,
          before,
          ladderPole(i),
        ]);
      }
    }
  });
});
