/**
 * selectionSubsystem — owns the engine's hover / select state cluster.
 *
 * Before this module existed, four sibling helpers (`pointInfoForSelection`,
 * `selectionEq`, `setHovered`, `setSelected`) sat inline in `engine.ts`,
 * reading and writing `state.picking.hovered` / `state.picking.selected`
 * directly while folding in the React-callback fan-out
 * (`cb.onHoverChange`, `cb.onSelectChange`).  That ad-hoc cluster grew
 * during the engine's early days for a good reason — every site was
 * concretely close to the React seam — but with `tweenManager` and
 * `thumbnailSubsystem` having proven the closure-returning factory
 * pattern in Spec B, the selection cluster is the next obvious member.
 *
 * ### Why a closure-returning factory rather than a class?
 *
 * Same rationale the engine uses everywhere else: the codebase's
 * convention is "factories return typed handles, not class instances",
 * the internal `let hovered`/`let selected` are genuinely inaccessible
 * from outside (no `this.hovered` to reach in and poke), and the
 * one-allocation-per-engine cost is irrelevant — there's exactly one
 * engine per page.  Sibling subsystems (`tweenManager.ts`,
 * `thumbnailSubsystem.ts`, `spaceMouseSubsystem.ts`) all return closure
 * objects too, so adding an outlier here would diverge for no reason.
 *
 * ### Why state moves OUT of `state.picking`
 *
 * Spec D.3's option-A ("internal-only") wins over option-B
 * ("subsystem owns writes, `state.picking` mirrors them") because:
 *
 *   - Single source of truth.  Mirroring means two write sites — the
 *     subsystem AND any future code that forgets the subsystem exists.
 *     A typed accessor (`selection.hovered()`) catches the
 *     "I forgot to go through the subsystem" mistake at compile time.
 *   - The 5-ish external read sites are mechanical to update.  Most of
 *     them already lived inside `engine.ts` itself; the only
 *     cross-module reader is `renderFrame`'s `selected` halo uniform,
 *     which reads through the subsystem accessor cleanly.
 *   - `EnginePickingState` survives — it still owns the per-frame
 *     pick-throttle state (`latestMouseCss`, `lastPickedMouseCss`,
 *     `pickInFlight`, `pointerDown`).  Only the user-facing selection
 *     pair moves out, so the picking-state bag's responsibility narrows
 *     to "the throttle for the GPU pick pipeline" — a cleaner concept
 *     than the prior catch-all "anything pick-adjacent".
 *
 * ### Why callbacks fan-out from inside the subsystem
 *
 * Pre-extraction, callers had to remember to fire `cb.onHoverChange` /
 * `cb.onSelectChange` at every state-change site.  Six call sites for
 * `setSelected` (across engine.ts, wireInput, runFrame, public-handle
 * methods) and one for `setHovered` ALL relied on the inline helper
 * doing the deduplication + callback fan-out.  Move that knowledge
 * into the subsystem and the contract is: callers say "the user picked
 * X", the subsystem decides whether anything actually changed, and the
 * callback fires (or doesn't) by exactly one rule in one place.
 *
 * ### Deps shape — why closures, not snapshots
 *
 * `getCloud` / `getFamousMeta` / `getFamousXrefs` are passed as
 * accessor functions (not as values) so the subsystem reads the LIVE
 * cloud store + sidecar metadata at call time, not whatever was in
 * scope at engine construction.  This matters because:
 *
 *   - The cloud Map gets populated AFTER engine construction (the GPU
 *     init IIFE runs async and calls `state.sources.clouds.set(...)`),
 *     so a snapshot taken at construction would be perpetually empty.
 *   - Famous-meta sidecars arrive even later — sometime during
 *     `wireSlots`.  A snapshot would freeze the empty array.
 *   - Tier swaps replace the whole cloud per source; the accessor
 *     re-reads on each call, so post-swap selections see the new cloud
 *     without any re-binding.
 *
 * The same closure-deps pattern is what `state.subsystems.spaceMouse`
 * uses for its `cancelTween` callback, and what the `clickResolver`
 * uses for its visibility-mask read.
 *
 * ### prebuiltInfo — why an extra parameter on setSelected
 *
 * `selectByAlias` (from a deep-link drain or palette pick) is called
 * the moment the data-side `state.sources.clouds` map gets populated,
 * BUT before the GPU upload completes — the renderer's `loadedSources()`
 * doesn't yet include the source.  In that window, `pointInfoFor` sees
 * the cloud and would build the right PointInfo, but for symmetry with
 * pre-extraction behaviour (and to defend against potential future
 * timing changes) the caller can pass a pre-built PointInfo to bypass
 * the lookup entirely.  The halo will still light up on the next
 * frame or two once the GPU upload settles.
 */

import type { EngineCallbacks, PointCloud, PointInfo } from '../../../@types';
import type { Source } from '../../../data/sources';
import type {
  FamousMetaEntry,
  FamousXrefMap,
} from '../../loading/fetchers/famousMetaFetcher';
import { buildPointInfo } from '../helpers/pointInfoBuilder';

/**
 * A `(source, localIdx)` selection — what the picker decodes from its
 * r32uint readback, and what every selection-changing call site
 * forwards to this subsystem.  Two distinct slots (hovered / selected)
 * track independently because the user can hover one galaxy while
 * another stays pinned (CLAUDE.md captures the same invariant).
 */
export type SelectionInput = {
  source: Source;
  localIdx: number;
};

export type SelectionSubsystem = {
  /** Currently-hovered point, or null. */
  hovered(): SelectionInput | null;
  /** Currently-pinned (clicked) point, or null. */
  selected(): SelectionInput | null;
  /** Update the hover state.  Fires `cb.onHoverChange` only on actual change. */
  setHovered(sel: SelectionInput | null): void;
  /**
   * Update the selection state.  Fires `cb.onSelectChange` only on
   * actual change.  Optional `prebuiltInfo` lets callers (e.g.
   * `selectByAlias`) pass the PointInfo directly when the GPU upload
   * hasn't settled yet (the cloud is in `state.sources.clouds` but the
   * renderer hasn't received it).
   */
  setSelected(sel: SelectionInput | null, prebuiltInfo?: PointInfo | null): void;
  /**
   * Build the PointInfo for a (source, localIdx) tuple.  Returns null
   * if the cloud isn't loaded or the index is out-of-range.  Used both
   * internally (for the hover/select callback fan-out) and by callers
   * that want to look up a point without changing selection state.
   */
  pointInfoFor(sel: SelectionInput): PointInfo | null;
  /** Release internal state (no GPU resources to release). */
  destroy(): void;
};

/**
 * Hooks the subsystem needs from the outside world.  All passed once
 * at construction; the cloud / sidecar accessors are CLOSURES (not
 * values) so the subsystem reads the live state at call time — see
 * the module header for why that matters.
 */
export type CreateSelectionSubsystemInput = {
  /** UI-callback sink — only `onHoverChange` / `onSelectChange` are read. */
  cb: EngineCallbacks;
  /** Live read of source clouds; closure rather than snapshot so tier swaps land. */
  getCloud: (source: Source) => PointCloud | undefined;
  /** Live read of the famous-galaxy meta sidecar (curated names + thumbnail IDs). */
  getFamousMeta: () => readonly FamousMetaEntry[];
  /** Live read of the famous-galaxy xref sidecar (cross-survey ID joins). */
  getFamousXrefs: () => FamousXrefMap;
};

/**
 * Are these two selections value-equal?  Both null → equal; both
 * non-null with matching `(source, localIdx)` → equal; otherwise
 * different.  Lifted out of the closure so it doesn't get re-allocated
 * per engine instance (purely cosmetic; engine is a singleton anyway).
 */
function selectionEq(
  a: SelectionInput | null,
  b: SelectionInput | null,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.source === b.source && a.localIdx === b.localIdx;
}

export function createSelectionSubsystem(
  input: CreateSelectionSubsystemInput,
): SelectionSubsystem {
  const { cb, getCloud, getFamousMeta, getFamousXrefs } = input;

  // Internal mutable state.  Closure-captured `let`s so they're
  // genuinely inaccessible from outside (no `this.hovered` for a
  // future caller to reach in and poke).  Both start null — no
  // selection until the first hover pick / click resolves.
  let hovered: SelectionInput | null = null;
  let selected: SelectionInput | null = null;

  /**
   * Build a PointInfo for a `(source, localIdx)` selection, or null if
   * the source's cloud isn't loaded or `localIdx >= cloud.count`.
   *
   * The bounds check defends the tier-swap-window race: a still-in-
   * flight pick from a previous frame can return a `(source, localIdx)`
   * decoded against an older, larger layout — without the guard,
   * `buildPointInfo` would index past the end of the freshly-uploaded
   * smaller cloud's typed arrays and crash downstream `.toFixed()`
   * calls in the InfoCard.  Returning null here is the right
   * semantics: "we don't have data for that pick; render no card,
   * the next frame's pick will succeed".
   */
  function pointInfoFor(sel: SelectionInput): PointInfo | null {
    const c = getCloud(sel.source);
    if (!c) return null;
    if (sel.localIdx < 0 || sel.localIdx >= c.count) return null;
    return buildPointInfo(c, sel.localIdx, sel.source, getFamousMeta(), getFamousXrefs());
  }

  function setHovered(sel: SelectionInput | null): void {
    if (selectionEq(sel, hovered)) return;
    hovered = sel;
    // Hoist the info computation so both flat and nested fires receive
    // the same value (and we don't pay for `pointInfoFor` twice).
    const info = sel !== null ? pointInfoFor(sel) : null;
    cb.onHoverChange?.(info);
    cb.selection?.onHoverChange?.(info);
  }

  function setSelected(
    sel: SelectionInput | null,
    prebuiltInfo?: PointInfo | null,
  ): void {
    if (selectionEq(sel, selected)) return;
    selected = sel;
    // `prebuiltInfo` short-circuits the cloud lookup for the
    // `selectByAlias` race window — see the module header for the
    // pre-GPU-upload story.  The `!== undefined` check distinguishes
    // "caller passed null on purpose" from "caller didn't pass it":
    // an explicit null means "I have no info, fire the callback with
    // null", whereas `undefined` means "look it up yourself".
    const info =
      prebuiltInfo !== undefined ? prebuiltInfo : sel !== null ? pointInfoFor(sel) : null;
    cb.onSelectChange?.(info);
    cb.selection?.onSelectChange?.(info);
  }

  function destroy(): void {
    // Release internal refs — purely defensive (engine is a singleton,
    // remounts replace the whole subsystem instance anyway), but
    // matches the symmetric `destroy()` shape every sibling subsystem
    // exposes.  Subsequent `hovered()` / `selected()` reads return null.
    hovered = null;
    selected = null;
  }

  return {
    hovered: () => hovered,
    selected: () => selected,
    setHovered,
    setSelected,
    pointInfoFor,
    destroy,
  };
}
