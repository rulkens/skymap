/**
 * debug — developer diagnostic lenses on the rendered scene (overlays, pass
 * disables, GPU-timing strategy override, clip-path inspector). Reducer
 * bodies are verbatim from the old `CORE_REDUCERS`, re-based onto `debug`.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import {
  DEFAULT_ALIGN_SEC,
  DEFAULT_LINGER,
  DEFAULT_LINGER_SEC,
  DEFAULT_LOOK_AHEAD,
  DEFAULT_PASS_BY_DIR,
  DEFAULT_PASS_BY_OFFSET,
  DEFAULT_RAMP_SEC,
  DEFAULT_SPLINE,
  DEFAULT_TURN_DELAY,
} from '../../../services/engine/animation/pathDefaults';
import { DEBUG_OVERLAY_ROWS } from '../../../data/debug/debugOverlayRows';
import type { DebugSettings } from '../../../@types/settings/DebugSettings';
import type { DebugOverlayKey } from '../../../@types/data/debug/DebugOverlayKey';
import type { ClipId } from '../../../@types/animation/ClipId';
import type { SplineMode } from '../../../@types/animation/SplineMode';
import type { PassByDir } from '../../../@types/animation/PassByDir';
import type { ClipPathTuningKnob } from '../../../@types/settings/ClipPathTuningKnob';
import type { RenderStrategy } from '../../../@types/engine/frame/RenderStrategy';

const initialState: DebugSettings = {
  // One entry per DEBUG_OVERLAY_ROWS row, all off — the roster is the
  // single source of truth so a new row can't ship unseeded.
  overlays: Object.fromEntries(DEBUG_OVERLAY_ROWS.map((row) => [row.key, false])) as Record<
    DebugOverlayKey,
    boolean
  >,
  // Empty in production: a developer populates it from the DebugPanel's
  // renderer-toggle section. A fresh record per engine — never persisted.
  disabledPasses: {},
  // 'auto' reproduces the old timing-derived pass shape, so production +
  // ?gpuTimings stay identical to before Joint 1 (see `resolveStrategy`).
  renderStrategy: 'auto',
  // Clip-path inspector idle: no clip chosen, scrubber at the start. The
  // overlay stays quiet until the curator clicks "Calculate". The pacing
  // knobs seed from the flyPath defaults but every override is INACTIVE, so a
  // fresh Calculate previews the clip's own authored pacing until the curator
  // touches a slider (which activates just that knob).
  clipPathInspect: {
    clipId: null,
    scrub01: 0,
    align: DEFAULT_ALIGN_SEC,
    rampSec: DEFAULT_RAMP_SEC,
    linger: DEFAULT_LINGER,
    lingerSec: DEFAULT_LINGER_SEC,
    spline: DEFAULT_SPLINE,
    turnDelay: DEFAULT_TURN_DELAY,
    lookAhead: DEFAULT_LOOK_AHEAD,
    passByOffset: DEFAULT_PASS_BY_OFFSET,
    passByDir: DEFAULT_PASS_BY_DIR,
    active: {
      align: false,
      rampSec: false,
      linger: false,
      spline: false,
      passBy: false,
    },
  },
};

export const debugSlice = createSlice({
  name: 'settings/debug',
  reducerPath: 'debug',
  initialState,
  reducers: {
    // One reducer for every DEBUG_OVERLAY_ROWS toggle — writes one entry
    // in-place (like setPassDisabled below), never the whole record.
    setDebugOverlay: (
      debug,
      action: PayloadAction<{ key: DebugOverlayKey; enabled: boolean }>,
    ) => {
      debug.overlays[action.payload.key] = action.payload.enabled;
    },
    setPassDisabled: (
      debug,
      action: PayloadAction<{ pass: string; disabled: boolean }>,
    ) => {
      // Open-world membership record (any pass name): `[name] === true` disables.
      debug.disabledPasses[action.payload.pass] = action.payload.disabled;
    },
    // Override the frame's render-pass shape independently of GPU timing (Joint 1;
    // see `resolveStrategy`). 'auto' restores the timing-derived default.
    setRenderStrategy: (debug, action: PayloadAction<RenderStrategy | 'auto'>) => {
      debug.renderStrategy = action.payload;
    },
    // Clip-path inspector: choose which clip to sample. The saga watches this
    // action to (re)compute the snapshot; the scrubber resets to the start.
    inspectClipPath: (debug, action: PayloadAction<ClipId>) => {
      debug.clipPathInspect.clipId = action.payload;
      debug.clipPathInspect.scrub01 = 0;
    },
    // Re-sample the shown clip with everything fresh EXCEPT the start pose, which
    // the seam keeps from the last Calculate — so moving the camera to view the
    // path then tuning a knob doesn't snap the start to the new viewpoint. The
    // saga watches this; state-wise it mirrors `inspectClipPath`.
    recalcClipPath: (debug, action: PayloadAction<ClipId>) => {
      debug.clipPathInspect.clipId = action.payload;
      debug.clipPathInspect.scrub01 = 0;
    },
    // Drop the inspected path (the "Clear" button). The saga clears the held
    // snapshot so the overlay goes quiet.
    clearClipPath: (debug) => {
      debug.clipPathInspect.clipId = null;
      debug.clipPathInspect.scrub01 = 0;
    },
    // Move the scrubber (a [0,1] fraction). Pure scalar write — the overlay's
    // gizmo reads it each frame and maps it to the nearest held sample.
    setClipPathScrub: (debug, action: PayloadAction<number>) => {
      debug.clipPathInspect.scrub01 = action.payload;
    },
    // flyPath pacing knobs the saga bakes into the clip at Calculate time — but
    // only the ones the curator has ACTIVATED (see `setClipPathTuningActive`).
    // `align` = start-aim blend seconds; `rampSec` = ease ramp seconds each end
    // (0 = use the named ease); `linger` = per-target brake depth [0,1] (0 =
    // cruise straight through). Touching a value activates that knob's override
    // (so dragging a slider is enough to opt in); Re-Calculate to apply.
    setClipPathAlign: (debug, action: PayloadAction<number>) => {
      debug.clipPathInspect.align = action.payload;
      debug.clipPathInspect.active.align = true;
    },
    setClipPathRampSec: (debug, action: PayloadAction<number>) => {
      debug.clipPathInspect.rampSec = action.payload;
      debug.clipPathInspect.active.rampSec = true;
    },
    // `linger` (dwell depth) and `lingerSec` (window width) are the two dwell
    // sub-knobs — they ride the ONE `linger` override gate (one dwell concept),
    // so touching either activates `linger`.
    setClipPathLinger: (debug, action: PayloadAction<number>) => {
      debug.clipPathInspect.linger = action.payload;
      debug.clipPathInspect.active.linger = true;
    },
    setClipPathLingerSec: (debug, action: PayloadAction<number>) => {
      debug.clipPathInspect.lingerSec = action.payload;
      debug.clipPathInspect.active.linger = true;
    },
    // Spline basis A/B: centripetal Catmull-Rom ↔ causal Hermite. `turnDelay`
    // (overshoot) and `lookAhead` (look-lead seconds) are the causal-only
    // sub-knobs — they ride the ONE `spline` override gate (they're meaningless
    // without the causal basis), so touching any of the three activates `spline`.
    setClipPathSpline: (debug, action: PayloadAction<SplineMode>) => {
      debug.clipPathInspect.spline = action.payload;
      debug.clipPathInspect.active.spline = true;
    },
    setClipPathTurnDelay: (debug, action: PayloadAction<number>) => {
      debug.clipPathInspect.turnDelay = action.payload;
      debug.clipPathInspect.active.spline = true;
    },
    setClipPathLookAhead: (debug, action: PayloadAction<number>) => {
      debug.clipPathInspect.lookAhead = action.payload;
      debug.clipPathInspect.active.spline = true;
    },
    // Fly-past: `passByOffset` (radius units) and `passByDir` are the two fly-past
    // sub-knobs — they ride the ONE `passBy` override gate (they're one
    // cinematographic concept), so touching either activates `passBy`.
    setClipPathPassByOffset: (debug, action: PayloadAction<number>) => {
      debug.clipPathInspect.passByOffset = action.payload;
      debug.clipPathInspect.active.passBy = true;
    },
    setClipPathPassByDir: (debug, action: PayloadAction<PassByDir>) => {
      debug.clipPathInspect.passByDir = action.payload;
      debug.clipPathInspect.active.passBy = true;
    },
    // Toggle a single pacing knob's override on/off. Off (the default) lets the
    // clip's own authored value flow through; the row checkbox drives this, and
    // the value setters above flip it on when the curator touches a slider.
    setClipPathTuningActive: (
      debug,
      action: PayloadAction<{ knob: ClipPathTuningKnob; active: boolean }>,
    ) => {
      debug.clipPathInspect.active[action.payload.knob] = action.payload.active;
    },
  },
});

export const {
  setDebugOverlay,
  setPassDisabled,
  setRenderStrategy,
  inspectClipPath,
  recalcClipPath,
  clearClipPath,
  setClipPathScrub,
  setClipPathAlign,
  setClipPathRampSec,
  setClipPathLinger,
  setClipPathLingerSec,
  setClipPathSpline,
  setClipPathTurnDelay,
  setClipPathLookAhead,
  setClipPathPassByOffset,
  setClipPathPassByDir,
  setClipPathTuningActive,
} = debugSlice.actions;
