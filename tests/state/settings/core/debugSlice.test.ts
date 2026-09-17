/**
 * Each clip-path sub-knob rides an override gate; writing a knob without
 * arming its gate leaves the inspector lens silently inert.
 */
import { describe, it, expect } from 'vitest';

import {
  debugSlice,
  setDebugOverlay,
  setClipPathLinger,
  setClipPathLingerSec,
  setClipPathLookAhead,
  setClipPathTuningActive,
} from '../../../../src/state/settings/core/debugSlice';

describe('debugSlice', () => {
  it('setDebugOverlay flips exactly the targeted row (Immer in-place, not a record swap)', () => {
    const before = debugSlice.getInitialState();
    const next = debugSlice.reducer(before, setDebugOverlay({ key: 'pick-buffer', enabled: true }));
    expect(next.overlays['pick-buffer']).toBe(true);
    expect(next.overlays['orbit-trail-impostor']).toBe(false);
  });

  it('setting a tuning value activates that knob (drag-to-activate)', () => {
    const next = debugSlice.reducer(debugSlice.getInitialState(), setClipPathLinger(0.8));
    expect(next.clipPathInspect.linger).toBe(0.8);
    expect(next.clipPathInspect.active.linger).toBe(true);
    // Other knobs stay inactive.
    expect(next.clipPathInspect.active.align).toBe(false);
    expect(next.clipPathInspect.active.spline).toBe(false);
  });

  it('setClipPathLingerSec sets the window and rides the one linger override', () => {
    // lingerSec is a dwell sub-knob with no gate of its own — it rides the single
    // `linger` override, so touching it activates `linger`.
    const next = debugSlice.reducer(debugSlice.getInitialState(), setClipPathLingerSec(3.5));
    expect(next.clipPathInspect.lingerSec).toBe(3.5);
    expect(next.clipPathInspect.active.linger).toBe(true);
  });

  it('setClipPathLookAhead sets the value and activates the one spline override', () => {
    // lookAhead is a causal-only sub-knob with no gate of its own — it rides the
    // single `spline` override, so touching it activates `spline`.
    const next = debugSlice.reducer(debugSlice.getInitialState(), setClipPathLookAhead(1.5));
    expect(next.clipPathInspect.lookAhead).toBe(1.5);
    expect(next.clipPathInspect.active.spline).toBe(true);
  });

  it('setClipPathTuningActive toggles a knob without touching its value', () => {
    const initial = debugSlice.getInitialState();
    const activated = debugSlice.reducer(
      initial,
      setClipPathTuningActive({ knob: 'align', active: true }),
    );
    expect(activated.clipPathInspect.active.align).toBe(true);
    expect(activated.clipPathInspect.align).toBe(initial.clipPathInspect.align);

    const off = debugSlice.reducer(
      activated,
      setClipPathTuningActive({ knob: 'align', active: false }),
    );
    expect(off.clipPathInspect.active.align).toBe(false);
  });
});
