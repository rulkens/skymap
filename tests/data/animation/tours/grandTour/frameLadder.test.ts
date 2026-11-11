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

import { rootReducer } from '../../../../../src/store/rootReducer';
import { grandTour } from '../../../../../src/data/animation/tours/grandTour';
import { mergeSnapshot } from '../../../../../src/state/settings/mergeSnapshotAction';
import { mergeSettingsSnapshot } from '../../../../../src/state/settings/mergeSettingsSnapshot';
import { computeSceneEntering } from '../../../../../src/state/tour/computeSceneEntering';
import { captureScene } from '../../../../../src/state/scene/captureScene';
import { sceneActionsOf } from '../../../../../src/utils/animation/sceneActionsOf';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { SceneEffect } from '../../../../../src/@types/animation/SceneEffect';
import type { OrientationFrameId } from '../../../../../src/@types/camera/orientation/OrientationFrameId';
import type { RootState } from '../../../../../src/store/types';

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

    // docs/tour/implementation-notes.md's frame ladder: openingTitle (beat 0)
    // tilts to galactic; nothing touches it again until approachM31 (beat 2)
    // tilts to supergalactic for the rest of the outward journey; homeAgain
    // (the last beat's dwell) tilts back to galactic for the landing. This is
    // the DoD line "beats 02–09 with the supergalactic plane horizontal" —
    // pinned here as the EFFECTIVE per-beat value, not the authored literal.
    const last = grandTour.beats.length - 1;
    expect(last).toBeGreaterThanOrEqual(9);
    expect(orientationPerBeat[0]).toBe('galactic');
    expect(orientationPerBeat[1]).toBe('galactic');
    for (let i = 2; i < last; i++) {
      expect(orientationPerBeat[i]).toBe('supergalactic');
    }
    expect(orientationPerBeat[last]).toBe('galactic');
  });
});
