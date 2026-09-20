import type { ReadyFrameContext } from '../../../../../@types/engine/frame/ReadyFrameContext';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';

/**
 * At most ONE star cut per frame context, shared by `advanceStarCut` (the
 * writer) and `readStarCut` (the readers). Two properties depend on it, so
 * it is correctness, not just a cache:
 *
 *   - The ramps advance once. `advanceStarCut` runs first each real frame and
 *     registers its one cut under EVERY view of the rig (`views[0]` is the
 *     main view, the one the memo is keyed on); every later call for any of
 *     those contexts returns that result instead of walking again, which is
 *     what makes "advance runs once" hold with no viewSlot or ctx-identity
 *     special case at the four call sites.
 *   - Every consumer reads the SAME `anyNodeFading`. Only the advancing path
 *     sets that flag (`computeStarCut`), so a read-only recompute would report
 *     `false` — a lost keep-ticking vote, and a dissolve frozen mid-fade.
 *
 * `deriveFrameContext` mints a fresh ctx per real frame, so entries are GC'd
 * with it — hence a WeakMap and no eviction. A `null` cut (no renderer, master
 * toggle off) is memoised too, which `has` distinguishes from "absent".
 */
const cutByCtx = new WeakMap<ReadyFrameContext, PreparedStarCut | null>();

export function starCutOncePerCtx(
  views: readonly ReadyFrameContext[],
  compute: () => PreparedStarCut | null,
): PreparedStarCut | null {
  const main = views[0]!;
  if (cutByCtx.has(main)) return cutByCtx.get(main)!;
  const result = compute();
  for (const view of views) cutByCtx.set(view, result);
  return result;
}
