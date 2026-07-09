/**
 * HoverPickDeps — the dependency bag for `createHoverPickDriver`.
 *
 * ### Why a bag rather than a flat argument list
 *
 * The driver is tested with a fake GPU (no real WebGPU device) by
 * substituting `pickRenderer`, `state`, and `store` for stubs. A
 * bag makes that substitution structural: new deps are added or
 * removed without changing call-site syntax everywhere.
 *
 * ### Thunks vs captured values
 *
 * `collectTargets`, `viewportPx`, `pointSizePx`, `timingDescriptor`, and
 * `uniformBytes` are live thunks — called at pick-fire time so they always
 * reflect the engine's current state. A snapshot captured at
 * driver-construction time would be stale the moment the user resizes the
 * window or toggles a catalog layer. `uniformBytes` rebuilds the packed
 * point pick uniform from the pick-time camera on demand (see
 * `pickUniformBytesOf`), returning `null` before the engine is ready to
 * pick; the driver skips a null result to match its pre-first-frame no-op.
 * `state` is still read directly — but only for the transient
 * `pickInFlight` / `pointerDown` flags, not for any packed byte image.
 *
 * ### Why no `requestRender` / scheduler field
 *
 * Hover feeds only the React InfoCard text; there is no hover halo in
 * the rendered scene, so a hover change requires no re-render. Excluding
 * the scheduler from the bag makes this a structural guarantee: the
 * driver cannot accidentally wake the loop.
 */

import type { EnginePickingState } from '../state/EnginePickingState';
import type { PickRenderer } from '../../rendering/PickRenderer';
import type { ResolvePickDeps } from '../ResolvePickDeps';
import type { PickTargets } from '../../../services/engine/helpers/collectPickTargets';
import type { Vec2 } from '../../math/Vec2';

export type HoverPickDeps = {
  /** The engine's picking sub-state — read for `pickInFlight` and `pointerDown`. */
  readonly state: { picking: EnginePickingState };
  /**
   * Packed point pick uniform for the pick-time camera, or `null` before the
   * engine is ready to pick. Thunk so the bytes are rebuilt from the current
   * camera + settings at fire time (see `pickUniformBytesOf`) rather than read
   * from a per-frame stash. Null → skip, matching the pre-first-frame no-op.
   */
  readonly uniformBytes: () => ArrayBuffer | null;
  /** The GPU pick renderer — called to fire a pick at pointer position. */
  readonly pickRenderer: PickRenderer;
  /**
   * Structurally typed so the test fake doesn't need the full store shape.
   * Only `dispatch` is required — the driver writes hover results and nothing
   * else.
   */
  readonly store: { dispatch: (action: unknown) => void };
  /** Passed verbatim to `resolvePick` to decode a GPU hit into a `SelectionRef`. */
  readonly resolveDeps: ResolvePickDeps;
  /**
   * Live-derived pick targets at fire time — the same rule the click path
   * uses: strictly fresher than any pre-frame snapshot. Thunk so the driver
   * re-reads the current pick mask and loaded catalogs every time, not once
   * at construction.
   */
  readonly collectTargets: () => PickTargets;
  /**
   * Physical canvas size in backing-store pixels (post-DPR, `canvas.width`
   * × `canvas.height`). Thunk so viewport changes take effect on the next
   * pick, not stale at construction.
   */
  readonly viewportPx: () => Vec2;
  /**
   * Current `state.settings.galaxyCatalogs.sizePx`. Thunk so a settings
   * change takes effect immediately on the next pick without requiring the
   * driver to be reconstructed.
   */
  readonly pointSizePx: () => number;
  /**
   * GPU-timing descriptor for the 'pick' slot, or `undefined` when the
   * timing service is inactive. Thunk so the driver works correctly when
   * the timing service initialises asynchronously after the driver is
   * created.
   */
  readonly timingDescriptor: () => GPURenderPassTimestampWrites | undefined;
};
