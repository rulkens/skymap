/**
 * clickHandler — wraps the GPU pick + decode step the engine runs in
 * response to a canvas click. Returns the `Selection` the click hit, or
 * null for background.
 *
 * The resolver is deliberately thin: pick → `pickToSelection` → `Selection`.
 * It does NOT resolve the target (GalaxyInfo / StructureRecord) — `setSelected`
 * owns that, resolving once for the InfoCard and again-free for the dblclick
 * focus via `selectedTarget()`. Keeping resolution in the subsystem means the
 * click path holds no resolved copy to drift. The decode → Selection map is
 * shared with the hover path so the two can't diverge.
 *
 * ### What the resolver returns (see `pickToSelection`)
 *
 *   - `null` — background, another pick in flight, or a structure ring with
 *     no backing record. Engine calls `setSelected(null)`.
 *   - `{ kind: 'galaxy', source, localIdx }` — a galaxy catalog point. Returned
 *     unconditionally; a not-yet-loaded cloud surfaces as
 *     onSelectChange(null) inside `setSelected`, not a dropped selection.
 *   - `{ kind: 'structure', id }` — a structure ring resolved to its
 *     record's stable id.
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
import type { Selection } from '../../../@types/engine/subsystems/Selection';
import { pickToSelection } from '../helpers/pickToSelection';

export function createClickResolver(input: CreateClickResolverInput): ClickResolver {
  const { pickRenderer, structures } = input;

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the click resolver is one of
  // the engine's ~13 teardown targets, and the shared shape lets
  // engine.destroy() iterate uniformly across the bag.
  const resolver: ClickResolver = {
    async resolveClick(args: ClickResolveInput): Promise<Selection | null> {
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
      // Decode → Selection via the shared map (same one the hover path
      // uses), so click and hover can't drift on how a pixel resolves.
      return pickToSelection(pick, structures);
    },
    destroy(): void {
      // Intentionally empty — see the type-level docstring for why.
    },
  };
  resolver satisfies Destroyable;
  return resolver;
}
