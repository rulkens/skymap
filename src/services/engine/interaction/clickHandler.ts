/**
 * clickHandler — wraps the GPU pick + decode step the engine runs in
 * response to a canvas click. Returns the `Selection` the click hit, or
 * null for background.
 *
 * The resolver is deliberately thin: pick → decode → `Selection`. It does
 * NOT resolve the target (GalaxyInfo / StructureRecord) — `setSelected`
 * owns that, resolving once for the InfoCard and again-free for the
 * dblclick focus via `selectedTarget()`. Keeping resolution in the
 * subsystem means the click path holds no resolved copy to drift.
 *
 * ### What the resolver returns
 *
 *   - `null` — background, or another pick was already in flight.
 *     Engine calls `setSelected(null)`.
 *   - `{ kind: 'galaxy', source, localIdx }` — a survey point. Returned
 *     unconditionally; a not-yet-loaded cloud surfaces as
 *     onSelectChange(null) inside `setSelected`, not a dropped selection.
 *   - `{ kind: 'poi', id }` — a structure ring; `resolvePoi` maps the
 *     decoded `(category, poiIndex)` to the record's stable id. A missing
 *     resolver or unallocated index → null (no phantom POI card).
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

export function createClickResolver(input: CreateClickResolverInput): ClickResolver {
  const { pickRenderer, resolvePoi } = input;

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the click resolver is one of
  // the engine's ~13 teardown targets, and the shared shape lets
  // engine.destroy() iterate uniformly across the bag.
  const resolver: ClickResolver = {
    async resolveClick(args: ClickResolveInput): Promise<Selection | null> {
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
      if (result === null) return null;

      // Structure variant from the discriminated `PickResult`: a
      // cluster / supercluster / void / group ring claimed the pixel (any
      // non-galaxy kind). Resolve `(category, poiIndex)` to the record to
      // carry its stable `id` — null when the caller passed no resolver or
      // the index is unallocated (an old shader frame), so the InfoCard
      // never shows a phantom POI card.
      if (result.kind !== 'galaxy') {
        const poi = resolvePoi?.({ category: result.kind, poiIndex: result.poiIndex });
        return poi ? { kind: 'poi', id: poi.id } : null;
      }

      // Galaxy variant — the only remaining `kind`. The selection is
      // returned unconditionally; `setSelected` resolves the GalaxyInfo and
      // tolerates a not-yet-loaded cloud by firing onSelectChange(null),
      // preserving the pre-extraction "select regardless" behaviour.
      return { kind: 'galaxy', source: result.source, localIdx: result.localIdx };
    },
    destroy(): void {
      // Intentionally empty — see the type-level docstring for why.
    },
  };
  resolver satisfies Destroyable;
  return resolver;
}
