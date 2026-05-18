/**
 * EngineState — the canonical shape of every mutable runtime value the
 * engine owns.
 *
 * ### Why this type exists
 *
 * Phases 1–3 of the engine.ts refactor pulled per-frame GPU dispatch,
 * pointer/keyboard input wiring, click resolution, the SpaceMouse and
 * thumbnail subsystems, and the camera-tween facade out into siblings
 * under `src/services/engine/`.  Each extraction shrank `frame()` and
 * the public-handle setters to thin orchestrators — but the *opening*
 * of `createEngine` still declared ~30 individual `let` bindings:
 * settings, bias thresholds, source visibility, picking flags, GPU
 * pipeline handles, subsystem handles, the camera, the framing
 * snapshot, and a handful of in-flight signals.
 *
 * Reading any one of those bindings was easy.  Answering "what state
 * does the engine own?" was hard — the bindings were scattered down
 * 250+ lines of header comments and weren't grouped by concern.  A
 * fresh reader (or a future Claude session) had to scroll the whole
 * preamble to learn the answer.
 *
 * Consolidating the bindings into a single `EngineState` value, with
 * sub-bags organised by concern, gives the engine one obvious answer.
 * The mental model becomes:
 *
 *   - `state.settings`   — what the SettingsPanel surfaces.
 *   - `state.bias`       — Malmquist-bias correction tuning.
 *   - `state.sources`    — loaded clouds + visibility selectors.
 *   - `state.picking`    — hover / click / drag mutables.
 *   - `state.gpu`        — pipelines / textures allocated lazily.
 *   - `state.subsystems` — owned long-lived helpers.
 *   - `state.cam`        — the orbit camera (null until first cloud).
 *   - `state.initialCamSnapshot` — framing snapshot for resetCamera().
 *
 * ### Why a single `const` instead of a class?
 *
 * The engine is a singleton: one canvas → one `createEngine` call →
 * one closure.  A class would gain only a `this.*` access pattern and
 * lose the clarity that the *outer* binding is immutable while every
 * *inner* field is mutated in place.  We use `const state: EngineState
 * = { ... }` so the closure cannot accidentally rebind the whole bag,
 * but `state.settings.brightness = 1.5` is still a one-liner.
 *
 * ### Why mutable in place rather than an immutable redux-style store?
 *
 * Per-frame writes happen in the rAF loop and the public-handle
 * setters fire several times per user interaction.  An immutable
 * setter (`state = { ...state, settings: { ...state.settings, brightness } }`)
 * would allocate two intermediate objects per slider drag — fine
 * for a React form, wasteful inside a 60 fps render loop.  Mutation
 * in place keeps allocations off the hot path and matches how the
 * subsystem facades (TweenManager, ThumbnailSubsystem) already manage
 * their own internal state.
 *
 * ### What this type is NOT
 *
 * - It does not own any *behaviour*.  It only declares the shape.  The
 *   factory that builds an `EngineState` value lives in `engine.ts`'s
 *   closure because it needs the `device` / `canvas` / callbacks that
 *   the engine receives.
 * - It does not list every transient closure variable.  Helpers like
 *   `lastScaleSig`, `detachControls`, and `cssToTexPx` stay as plain
 *   bindings — they're either single-use or scoped to one helper, not
 *   part of the engine's runtime state surface.
 * - It does not capture *initial values*.  Defaults live in
 *   `data/defaults.ts`; the consumer constructs an `EngineState` by
 *   pulling those constants into the right sub-bag.
 *
 * The sub-bag types live in their own `.d.ts` siblings — one type per
 * file matches the rest of the `@types/` convention and lets each bag
 * carry its own multi-paragraph rationale without bloating the root
 * type's docstring.
 */

import type { EngineSettingsState } from '../../settings/EngineSettingsState';
import type { EngineBiasState } from './EngineBiasState';
import type { EngineDebugState } from './EngineDebugState';
import type { EngineSourceState } from './EngineSourceState';
import type { EnginePickingState } from './EnginePickingState';
import type { EngineAssetSlots } from './EngineAssetSlots';
import type { EngineGpuHandles } from '../handles/EngineGpuHandles';
import type { EngineSubsystemHandles } from '../handles/EngineSubsystemHandles';
import type { createOrbitCamera } from '../../../services/camera/orbitCamera';
import type { InitialCam } from '../../camera/InitialCam';

export type EngineState = {
  settings: EngineSettingsState;
  bias: EngineBiasState;
  sources: EngineSourceState;
  picking: EnginePickingState;
  gpu: EngineGpuHandles;
  subsystems: EngineSubsystemHandles;
  cam: ReturnType<typeof createOrbitCamera> | null;
  initialCamSnapshot: InitialCam | null;
  assetSlots: EngineAssetSlots;
  /**
   * Debug-only per-frame skip flags.  Populated only by the React-
   * side DebugPanel; empty in production.  See `EngineDebugState`
   * for the rationale on living here vs the engine closure.
   */
  debug: EngineDebugState;
};
