import type { FrameView } from '../../../../../@types/engine/frame/FrameView';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';

/**
 * At most ONE star cut per frame context, shared by `advanceStarCut` (the
 * writer) and `readStarCut` (the readers). Two properties depend on it, so
 * it is correctness, not just a cache:
 *
 *   - The ramps advance once. `advanceStarCut` runs first each real frame and
 *     registers its one cut under EVERY view of the rig (`views[0]` is the
 *     canvas view the walk's origin comes from, and the one the memo is keyed
 *     on); every later call for any of those views returns that result
 *     instead of walking again, which is what makes "advance runs once" hold
 *     with no viewSlot or ctx-identity special case at the four call sites.
 *   - Every consumer reads the SAME `anyNodeFading`. Only the advancing path
 *     sets that flag (`computeStarCut`), so a read-only recompute would report
 *     `false` — a lost keep-ticking vote, and a dissolve frozen mid-fade.
 *
 * `deriveFrameContext` mints a fresh snapshot per real frame and `deriveView`
 * a fresh view per view, so entries are GC'd with them — hence a WeakMap and
 * no eviction. A `null` cut (no renderer, master toggle off) is memoised too,
 * which `has` distinguishes from "absent".
 */
const cutByCtx = new WeakMap<FrameView, PreparedStarCut | null>();

export function starCutOncePerCtx(
  views: readonly FrameView[],
  compute: () => PreparedStarCut | null,
): PreparedStarCut | null {
  const main = views[0]!;
  if (cutByCtx.has(main)) return cutByCtx.get(main)!;
  const result = compute();
  for (const view of views) cutByCtx.set(view, result);
  return result;
}
