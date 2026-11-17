/**
 * DemandCtx — the evaluator's input: everything `evaluateAssetDemand` reads to turn a row's
 * declared `AssetDemand` into demand and release edges, snapshotted once per pass by
 * `buildDemandCtx` (ADR 0005 §3). Read-only by construction: evaluation must not mutate
 * engine state. Settings switches are pure intent, so a just-disabled layer stops demanding
 * at once while it fades out. `slotState` carries the companion join (famous-galaxies meta
 * waits on its `.bin`). `cameraPosMpc` and `simDays` are the LAST produced frame's, because
 * the loop runs at the frame top; a one-frame-stale eye is immaterial to a multi-frame fetch,
 * and bodies move, so distances measure from where they sit at `simDays`.
 */

import type { EngineSettingsState } from '../settings/EngineSettingsState';
import type { AssetKey } from './AssetKey';
import type { LoadState } from './LoadState';
import type { UiState } from '../ui/UiState';
import type { Tier } from '../data/Tier';
import type { Vec3 } from '../math/Vec3';
import type { SelectionRefBase } from '../engine/selection/SelectionRefBase';

export type DemandCtx = {
  settings: Readonly<EngineSettingsState>;
  /** Read-only view of the shell's UI state; `paletteOpen` drives `'whenSearching'` rows. */
  ui: Readonly<UiState>;
  /** The `kind` of any slot by key, without exposing the slot's internals. */
  slotState: (k: AssetKey) => LoadState<unknown>['kind'];
  /** Built by the same `assembleOrbitCamera` call as `drawCamPos`, so demand and draw agree. */
  cameraPosMpc: Readonly<Vec3>;
  /** Julian days. */
  simDays: number;
  /** `EngineState.drawPxPerRad`: last frame's largest view px/rad, 0 before the first view. */
  drawPxPerRad: number;
  /** The live tier (`state.tier`): a tier that ships no file never demands it. */
  tier: Tier;
  /** Select, focus, or a pending request's claimed kind; hover never counts, so a sweep loads nothing. */
  selectedKinds: ReadonlySet<SelectionRefBase['type']>;
};
