/**
 * HoverPickDeps — the dependency bag for `createHoverPickDriver`.
 *
 * ### Why a bag rather than a flat argument list
 *
 * The driver is tested with a fake GPU (no real WebGPU device) by
 * substituting `pickProgram`, `state`, and `store` for stubs. A
 * bag makes that substitution structural: new deps are added or
 * removed without changing call-site syntax everywhere.
 *
 * ### Why so few fields
 *
 * The driver used to receive live thunks for the pick targets, viewport,
 * point size, timing descriptor, and packed camera bytes — everything an
 * imperative pick call needed. `pickProgram.pick` derives all of that
 * internally from the shared `EngineState` + the content-layer registry at
 * fire time, so the driver's job shrinks to "translate a pointer position to
 * texture-space and hand it over". `state` is still read directly — but only
 * for the transient `pickInFlight` / `pointerDown` scheduling flags.
 *
 * ### Why no `requestRender` / scheduler field
 *
 * Hover feeds only the React InfoCard text; there is no hover halo in
 * the rendered scene, so a hover change requires no re-render. Excluding
 * the scheduler from the bag makes this a structural guarantee: the
 * driver cannot accidentally wake the loop.
 */

import type { EnginePickingState } from '../state/EnginePickingState';
import type { PickProgram } from '../frame/PickProgram';
import type { ResolvePickDeps } from '../ResolvePickDeps';

export type HoverPickDeps = {
  /** The engine's picking sub-state — read for `pickInFlight` and `pointerDown`. */
  readonly state: { picking: EnginePickingState };
  /**
   * The per-slab pick program. Called with the texture-space cursor position;
   * it derives the pick-time camera, the pickable layers, and the timing slot
   * itself, and resolves to the front-most `PickResult` or `null`.
   */
  readonly pickProgram: PickProgram;
  /**
   * Structurally typed so the test fake doesn't need the full store shape.
   * Only `dispatch` is required — the driver writes hover results and nothing
   * else.
   */
  readonly store: { dispatch: (action: unknown) => void };
  /** Passed verbatim to `resolvePick` to decode a GPU hit into a `SelectionRef`. */
  readonly resolveDeps: ResolvePickDeps;
};
