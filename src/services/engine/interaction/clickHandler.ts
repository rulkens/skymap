/**
 * clickHandler — wraps the GPU pick + selection-resolution step the
 * engine runs in response to a canvas click.
 *
 * Before this module existed, the click flow lived inline in the
 * `attachOrbitControls({ onClick })` callback inside engine.ts's
 * async IIFE.  It read four closure variables (`pickRendererHandle`,
 * `renderer.loadedSources()`, `visibleSourceMask`, `clouds`) and was
 * tangled with the engine's `setSelected` notification path.
 *
 * Pulling the pick → selection-index chain into a tiny resolver gives us:
 *
 *   1. A unit-testable "given a click position + a mocked picker, do
 *      we end up with the right selection index?" — no GPU device
 *      required.
 *   2. A clear seam between the engine ("I want a click resolved")
 *      and the GPU ("here's a pick texture readback").  Future work
 *      (e.g. hover halos) can reuse the resolver without inheriting
 *      the click-specific call site.
 *   3. The pick → resolveGlobalIdx walk + the optional GalaxyInfo
 *      build live in one place, where they're easy to keep consistent
 *      with the per-frame hover pick gate further up in engine.ts.
 *
 * ### What the resolver returns
 *
 * The engine's `selectedIndex` state is a *global* instance index
 * (the picker's return value), and a click on background should clear
 * the selection.  The resolver therefore returns one of three states:
 *
 *   - `{ kind: 'clear' }`   — the picker returned -1 (background, or
 *                              another pick was already in flight).
 *                              Engine should call `setSelected(null)`.
 *
 *   - `{ kind: 'select', globalIdx, info }` — the picker hit a point
 *                              and we successfully built a GalaxyInfo.
 *                              Engine should call `setSelected(globalIdx)`.
 *                              `info` is ALSO returned for callers that
 *                              want it (e.g. an "auto-focus on click"
 *                              future feature) without re-running
 *                              `galaxyInfoFromGlobal`.
 *
 *   - `{ kind: 'select', globalIdx, info: null }` — picker hit a point
 *                              but resolveGlobalIdx or buildGalaxyInfo
 *                              failed.  Engine still selects globalIdx
 *                              for parity with the pre-extraction
 *                              behaviour: the old code did
 *                              `setSelected(idx)` regardless of whether
 *                              `galaxyInfoFromGlobal` would later return
 *                              null at the hover/select callback edge.
 *
 * Collapsing those into a single shape keeps the engine call site to
 * one switch (or two-line if/else) without losing information.
 *
 * The resolver does NOT call `requestRender()` — that's the engine's
 * job after it updates `selectedIndex`.  Keeping the resolver
 * scheduler-free means tests don't need a render-scheduler stub.
 *
 * ### Idempotency / in-flight calls
 *
 * The underlying `pickRenderer.pick` already handles the "second call
 * before the first resolves returns -1 immediately" race — see the
 * comment on `pickRenderer.pick`.  We mirror that contract: a click
 * fired during another in-flight pick resolves to `{ kind: 'clear' }`
 * rather than queueing.  Click frequency is low enough that the user
 * never notices.
 */

import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { ClickResolveInput } from '../../../@types/engine/ClickResolveInput';
import type { ClickResolution } from '../../../@types/engine/ClickResolution';
import type { ClickResolver } from '../../../@types/engine/ClickResolver';
import type { CreateClickResolverInput } from '../../../@types/engine/CreateClickResolverInput';

export function createClickResolver(input: CreateClickResolverInput): ClickResolver {
  const { pickRenderer, resolveSelection, buildGalaxyInfo } = input;

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the click resolver is one of
  // the engine's ~13 teardown targets, and the shared shape lets
  // engine.destroy() iterate uniformly across the bag.
  const resolver: ClickResolver = {
    async resolveClick(args: ClickResolveInput): Promise<ClickResolution> {
      const result = await pickRenderer.pick(
        args.viewportPx,
        args.pickXPx,
        args.pickYPx,
        args.visibleSources,
        args.pointSizePx,
        // Per-pass GPU timing — undefined when the timing service is
        // absent (no `timestamp-query` feature or overlay off).  The
        // pick render pass writes start/end timestamps into the
        // shared query set's 'pick' slot pair; the next main-frame
        // `endFrame` resolves and copies those slots.  See
        // PickRenderer.pick JSDoc.
        args.timingDescriptor,
      );
      if (result === null) return { kind: 'clear' };
      // Try to build a GalaxyInfo, but treat failure as "still select
      // the (source, localIdx)" for parity with the pre-extraction
      // engine — the old code did `setSelected(idx)` regardless of
      // whether `galaxyInfoFromGlobal` would later resolve null.
      const resolved = resolveSelection(result);
      const info = resolved
        ? buildGalaxyInfo(resolved.cloud, resolved.localIdx, resolved.source)
        : null;
      return { kind: 'select', selection: result, info };
    },
    destroy(): void {
      // Intentionally empty — see the type-level docstring for why.
    },
  };
  resolver satisfies Destroyable;
  return resolver;
}
