/**
 * clipFociReady — is every id-bearing focus effect in a clip resolvable right now?
 *
 * The tour saga must not call `resolveClipFoci` (which throws on a null resolution)
 * before the underlying catalog data is loaded. This predicate answers "can the
 * saga safely call resolveClipFoci on this clip right now?".
 *
 * ### Logic
 *
 * Walks the clip's effect tree with the same structural recursion as
 * `resolveClipFoci` — `seq`/`all` recurse into `children`, `fork` recurses into
 * `child`, everything else is a leaf. At id-bearing leaves:
 *
 *   - `moveTargetId(id)` and `dollyToId(id)`: call `resolveFocusId(id, deps)`;
 *     return false if null.
 *   - `focusId(null)`: a focus-clear cue — always ready (no data needed).
 *   - `focusId(id)`: call `resolveFocusId(id, deps)`; return false if null.
 *
 * ### Why a short-circuit walk instead of `collectFocusIds` + a batch check?
 *
 * Extracting a `collectFocusIds` helper would let both `clipFociReady` and
 * `resolveClipFoci` share the id-gathering walk. But `resolveClipFoci` doesn't
 * just collect ids — it rewrites each node to a concrete replacement, which
 * requires knowing the original node shape. And `clipFociReady` can short-circuit
 * as soon as it finds one unresolvable id, whereas a collect-then-check approach
 * always traverses the whole tree. The two walks are distinct enough that a shared
 * helper would have to return a richer type to serve both callers, adding
 * complexity for marginal reuse. Mirroring the walk locally keeps each function
 * focused and independently testable.
 *
 * ### Structure and milkyWay ids are always ready
 *
 * `resolveFocusId` returns a non-null `SelectionRef` for structure-prefixed ids
 * (e.g. `cluster-virgo-m87`) and for `milkyWay` without consulting the catalog
 * map — the resolution is by id format alone. So structure and milkyWay ids in
 * a clip never block the readiness gate.
 */

import type { ClipData } from '../../@types/animation/ClipData';
import type { Effect } from '../../@types/animation/Effect';
import type { ResolveDeps } from '../../@types/engine/ResolveDeps';
import { resolveFocusId } from '../../services/url/resolveFocusId';

/**
 * Returns true when every id-bearing focus effect in `data` resolves against
 * the current engine state in `deps`. Returns false as soon as any non-null
 * focus id cannot be resolved — the saga should poll until this returns true
 * before calling `resolveClipFoci`.
 *
 * A clip with no id-bearing effects is trivially ready.
 */
export function clipFociReady(data: ClipData, deps: ResolveDeps): boolean {
  return data.timeline.every((e) => walkEffect(e, deps));
}

// ─── Walk ────────────────────────────────────────────────────────────────────

/**
 * Recursively check one `Effect` node. Returns false as soon as any id-bearing
 * leaf fails to resolve, short-circuiting the rest of the tree.
 *
 * Structural nodes (`seq`, `all`, `fork`) recurse into their children.
 * Id-bearing leaves are checked via `resolveFocusId`. All other leaves pass
 * through unchanged — they carry no focus ids and are always ready.
 */
function walkEffect(effect: Effect, deps: ResolveDeps): boolean {
  switch (effect.kind) {
    // ── Structural nodes — recurse ──────────────────────────────────────────
    case 'seq':
      return effect.children.every((c) => walkEffect(c, deps));
    case 'all':
      return effect.children.every((c) => walkEffect(c, deps));
    case 'fork':
      return walkEffect(effect.child, deps);

    // ── Id-bearing leaves — check resolvability ─────────────────────────────
    case 'moveTargetId':
    case 'dollyToId':
    case 'lookAtId':
    case 'strafeId':
    case 'spinToId':
      return resolveFocusId(effect.id, deps) !== null;
    case 'focusId':
      // null is a focus-clear cue: always ready, no data needed.
      if (effect.id === null) return true;
      return resolveFocusId(effect.id, deps) !== null;

    // A flyPath carries id-bearing waypoints; each `atFocus` (id-form) must
    // resolve. Concrete `atPoint` waypoints need no data.
    case 'flyPath':
      return effect.waypoints.every((w) => !('id' in w) || resolveFocusId(w.id, deps) !== null);

    // ── Pass-through — camera actions, scene effects, hold/wait ────────────
    default:
      return true;
  }
}
