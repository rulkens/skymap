/**
 * grandTour frame ladder — the EFFECTIVE `settings.orientation` the tour runs
 * each beat under, not the raw `frameTo` literals.
 *
 * The old version of this file asserted the authored `frameTo(...)` calls
 * directly against each clip's timeline. That passed throughout the Critical
 * this suite now guards: `guidedTourSaga`'s beat-boundary `mergeSnapshot`
 * used to revert `settings.orientation` to its pre-tour value at every beat
 * boundary, even though the `frameTo` literals themselves were always
 * correct — a literal restatement of authored content cannot catch a bug in
 * how that content gets APPLIED. Per the project's testing convention (a test
 * must be able to fail on a real bug no other test or compiler check
 * catches), that restatement didn't earn its place.
 *
 * This version drives the two production mechanisms `guidedTourSaga` composes
 * at every beat boundary — the reconstruction fold (`computeSceneEntering` →
 * `mergeSnapshot`, copied verbatim from `guidedTourSaga.ts`) and the beat's
 * own cues actually firing (`applySceneEffect`, the same dispatch table
 * `clipPlayer` calls from) — against the REAL `grandTour` beats, and asserts
 * the resulting `settings.orientation` after each beat.
 *
 * Deliberately NOT run through `guidedTourSaga`/`visitBeatSaga` end to end:
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
import { mergeSnapshot } from '../../../../../src/state/settings/settingsSlice';
import { mergeSettingsSnapshot } from '../../../../../src/state/settings/mergeSettingsSnapshot';
import { computeSceneEntering } from '../../../../../src/state/tour/computeSceneEntering';
import { captureScene } from '../../../../../src/state/tour/captureScene';
import { applySceneEffect } from '../../../../../src/services/animation/applySceneEffect';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { SceneEffect } from '../../../../../src/@types/animation/SceneEffect';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { OrientationFrameId } from '../../../../../src/@types/camera/OrientationFrameId';
import type { RootState } from '../../../../../src/store/types';

/**
 * Walk a clip's effect tree in authored order and collect its `frameTo`
 * leaves — the tree-order equivalent of `compileClip`'s flat, atSec-sorted
 * `cues` list, narrowed to the one cue kind that can move `settings.orientation`.
 * `show`/`hide`/`focus` also route through `applySceneEffect`, but firing them
 * for real needs a live `state.subsystems.fades` (the visibility bridge) —
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
 * `liveUpBasisQuat` read (`upBasis.current`, an identity Mat3 is fine —
 * the roll's seed quaternion is not under test here).
 */
function fireFrameToCues(store: ReturnType<typeof makeStore>, clip: ClipData | undefined): void {
  if (clip === undefined) return;
  const state = {
    settings: store.getState().settings,
    cameraRuntime: { upBasis: { current: [1, 0, 0, 0, 1, 0, 0, 0, 1] } },
  } as unknown as EngineState;
  for (const effect of collectFrameToEffects(clip.timeline)) {
    applySceneEffect(effect, { state, store });
  }
}

describe('grand tour frame ladder — effective orientation per beat', () => {
  it('runs each beat under the pole set by its own (or an earlier) frameTo cue, never reverted at a beat boundary', () => {
    const store = makeStore();
    const snapshot = captureScene(store.getState() as RootState);

    const orientationPerBeat: OrientationFrameId[] = [];
    for (let i = 0; i < grandTour.beats.length; i++) {
      // The exact beat-boundary dispatch guidedTourSaga performs at the top
      // of every loop iteration (guidedTourSaga.ts) — this is the site the
      // Critical lived in: a raw write here used to sweep `orientation` back
      // to `snapshot`'s pre-tour value on every beat.
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
