/**
 * selectionSubsystem — owns the engine's hover / select state cluster.
 *
 * Before this module existed, four sibling helpers (`galaxyInfoForSelection`,
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
 *     init IIFE runs async and calls `state.sources.catalogs.set(...)`),
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
 * the moment the data-side `state.sources.catalogs` map gets populated,
 * BUT before the GPU upload completes — the renderer's `loadedSources()`
 * doesn't yet include the source.  In that window, `galaxyInfoFor` sees
 * the cloud and would build the right GalaxyInfo, but for symmetry with
 * pre-extraction behaviour (and to defend against potential future
 * timing changes) the caller can pass a pre-built GalaxyInfo to bypass
 * the lookup entirely.  The halo will still light up on the next
 * frame or two once the GPU upload settles.
 */

import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { SelectionInput } from '../../../@types/engine/subsystems/SelectionInput';
import type { SelectionSubsystem } from '../../../@types/engine/subsystems/SelectionSubsystem';
import type { CreateSelectionSubsystemInput } from '../../../@types/engine/subsystems/CreateSelectionSubsystemInput';
import { buildGalaxyInfo } from '../helpers/galaxyInfoBuilder';

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
   * Build a GalaxyInfo for a `(source, localIdx)` selection, or null if
   * the source's cloud isn't loaded or `localIdx >= cloud.count`.
   *
   * The bounds check defends the tier-swap-window race: a still-in-
   * flight pick from a previous frame can return a `(source, localIdx)`
   * decoded against an older, larger layout — without the guard,
   * `buildGalaxyInfo` would index past the end of the freshly-uploaded
   * smaller cloud's typed arrays and crash downstream `.toFixed()`
   * calls in the InfoCard.  Returning null here is the right
   * semantics: "we don't have data for that pick; render no card,
   * the next frame's pick will succeed".
   */
  function galaxyInfoFor(sel: SelectionInput): GalaxyInfo | null {
    const c = getCloud(sel.source);
    if (!c) return null;
    if (sel.localIdx < 0 || sel.localIdx >= c.count) return null;
    return buildGalaxyInfo(c, sel.localIdx, sel.source, getFamousMeta(), getFamousXrefs());
  }

  function setHovered(sel: SelectionInput | null): void {
    if (selectionEq(sel, hovered)) return;
    hovered = sel;
    // Hoist the info computation so both flat and nested fires receive
    // the same value (and we don't pay for `galaxyInfoFor` twice).
    const info = sel !== null ? galaxyInfoFor(sel) : null;
    cb.selection?.onHoverChange?.(info);
  }

  function setSelected(
    sel: SelectionInput | null,
    prebuiltInfo?: GalaxyInfo | null,
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
      prebuiltInfo !== undefined ? prebuiltInfo : sel !== null ? galaxyInfoFor(sel) : null;
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

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the selection subsystem is one
  // of the engine's ~13 teardown targets, and the shared shape lets
  // engine.destroy() iterate uniformly across the bag.
  const subsystem: SelectionSubsystem = {
    hovered: () => hovered,
    selected: () => selected,
    setHovered,
    setSelected,
    galaxyInfoFor,
    destroy,
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
