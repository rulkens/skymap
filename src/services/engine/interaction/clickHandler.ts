/**
 * clickHandler — wraps the GPU pick + decode + resolve step the engine
 * runs in response to a canvas click. Returns the `FocusableTarget` the
 * click hit (a resolved `GalaxyInfo` / `StructureInfo`), or null for
 * background.
 *
 * The resolver runs the whole pixel → target boundary: pick → `resolvePick`
 * → `FocusableTarget`. The decode + resolution is shared with the hover
 * path (both call `resolvePick`) so the two can't diverge on how a pixel
 * maps to a target. The engine forwards the result straight to
 * `setSelected`, which now just holds the already-resolved target.
 *
 * ### What the resolver returns (see `resolvePick`)
 *
 *   - `null` — background, another pick in flight, a not-yet-loaded cloud,
 *     or a structure ring with no backing record. Engine calls
 *     `setSelected(null)`.
 *   - a `GalaxyInfo` (`type: 'galaxyCatalog'`) — a resolved galaxy point.
 *   - a `StructureInfo` (`type: 'structure'`) — a resolved structure ring.
 *
 * The resolver does NOT call `requestRender()` — that's the engine's job
 * after it updates the selection. Scheduler-free keeps tests stub-free.
 *
 * ### Idempotency / in-flight calls
 *
 * `pickRenderer.pick` already returns null for a second call before the
 * first resolves — a click fired mid-pick resolves to null rather than
 * queueing. Click frequency is low enough the user never notices.
 */

import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { ClickResolveInput } from '../../../@types/engine/ClickResolveInput';
import type { ClickResolver } from '../../../@types/engine/ClickResolver';
import type { CreateClickResolverInput } from '../../../@types/engine/CreateClickResolverInput';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { ResolvePickDeps } from '../../../@types/engine/ResolvePickDeps';
import { resolvePick } from '../helpers/resolvePick';

export function createClickResolver(input: CreateClickResolverInput): ClickResolver {
  const { pickRenderer, getCloud, getFamousMeta, structures } = input;

  // Everything `resolvePick` needs, bundled once at construction so the
  // per-click path is a single call. Mirrors the hover path's deps.
  const deps: ResolvePickDeps = { getCloud, getFamousMeta, structures };

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the click resolver is one of
  // the engine's ~13 teardown targets, and the shared shape lets
  // engine.destroy() iterate uniformly across the bag.
  const resolver: ClickResolver = {
    async resolveClick(args: ClickResolveInput): Promise<FocusableTarget | null> {
      const pick = await pickRenderer.pick(
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
      // Decode + resolve via the shared boundary (same one the hover path
      // uses), so click and hover can't drift on how a pixel resolves.
      return resolvePick(pick, deps);
    },
    destroy(): void {
      // Intentionally empty — see the type-level docstring for why.
    },
  };
  resolver satisfies Destroyable;
  return resolver;
}
