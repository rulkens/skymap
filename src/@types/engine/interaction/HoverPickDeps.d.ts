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
 * `collectTargets`, `viewportPx`, `pointSizePx`, and `timingDescriptor`
 * are live thunks — called at pick-fire time so they always reflect
 * the engine's current state. A snapshot captured at driver-construction
 * time would be stale the moment the user resizes the window or toggles
 * a catalog layer. Only `lastFrameUniformBytes` is read from `state`
 * (not injected as a thunk) because the visual frame writes it once per
 * tick and the pick driver is the one consumer that must use the same
 * packed image the visual frame saw — a thunk over `state.picking` is
 * equivalent to reading `state.picking.lastFrameUniformBytes` directly,
 * and keeping it on `state` makes the write/read boundary explicit.
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
  /** The engine's picking sub-state — read for `pickInFlight` and `lastFrameUniformBytes`. */
  readonly state: { picking: EnginePickingState };
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
