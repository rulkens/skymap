/**
 * selectionSubsystem — owns the engine's hover + select + focus state.
 *
 * Three slots, each holding a `Selection` discriminated union
 * (`{kind:'galaxy', source, localIdx}` or `{kind:'poi', id}`) or
 * null, forming the engine's attention ladder: hover → select →
 * focus.  Setters dedupe via `selectionEq` and fan out to
 * `cb.selection.onHoverChange` / `onSelectChange` with the resolved
 * `FocusableTarget` (GalaxyInfo for galaxy variants, StructureRecord
 * for POIs) — callers never have to remember to fire the callback
 * themselves.
 *
 * ### Why `focused` is a third slot, not a synonym for `selected`
 *
 * A single click *selects* (pins the InfoCard); a double-click
 * *focuses* (tweens the camera in).  Cluster-focus mode — the
 * member-isolation fade that dims non-members of a structure — keys
 * off the deliberate focus gesture, not the casual select, so it
 * needs its own slot.  `setFocused` is symmetric with `setSelected`:
 * it owns the `cb.camera.onFocusChange` fan-out the same way
 * `setSelected` owns `onSelectChange`, so the GPU fade (read off
 * `focused()` in `runFrame`) and the React/URL focus state can never
 * desync — there is exactly one setter.  The optional `prebuiltInfo`
 * mirrors `setSelected`'s escape hatch for the `selectByAlias`
 * deep-link race.
 *
 * ### Deps are closures, not snapshots
 *
 * `getCloud` / `getFamousMeta` / `getPoi` are accessor functions so
 * the subsystem reads the LIVE source maps at call time.  Catalogs
 * arrive after engine construction (async GPU init), the sidecar
 * even later, and tier swaps replace whole sources mid-session — a
 * value snapshot taken at construction would be perpetually stale.
 *
 * ### prebuiltInfo escape hatch on setSelected
 *
 * `selectByAlias` can fire from a deep-link drain the moment the
 * data-side catalog arrives but BEFORE the GPU upload completes.  In
 * that window the cloud-lookup would briefly return null and the
 * InfoCard would render blank.  The optional second arg to
 * `setSelected` hands a pre-built GalaxyInfo straight to the
 * callback, bypassing the lookup until the GPU upload settles.
 * `commitGalaxyFocus` always forwards `info`, so every focus path
 * gets the defense for free.
 */

import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { GalaxySelection, Selection } from '../../../@types/engine/subsystems/Selection';
import type { SelectionSubsystem } from '../../../@types/engine/subsystems/SelectionSubsystem';
import type { CreateSelectionSubsystemInput } from '../../../@types/engine/subsystems/CreateSelectionSubsystemInput';
import { buildGalaxyInfo } from '../helpers/galaxyInfoBuilder';

/**
 * Are these two selections value-equal?  Both null → equal; both
 * non-null with matching discriminant + payload → equal; otherwise
 * different.  Lifted out of the closure so it doesn't get re-allocated
 * per engine instance (purely cosmetic; engine is a singleton anyway).
 */
function selectionEq(a: Selection | null, b: Selection | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'galaxy' && b.kind === 'galaxy') {
    return a.source === b.source && a.localIdx === b.localIdx;
  }
  if (a.kind === 'poi' && b.kind === 'poi') {
    return a.id === b.id;
  }
  return false;
}

export function createSelectionSubsystem(input: CreateSelectionSubsystemInput): SelectionSubsystem {
  const { cb, getCloud, getFamousMeta, getPoi } = input;

  // Closure-captured `let`s — genuinely inaccessible from outside.
  // All start null; `hovered`/`selected` populate from the first hover
  // pick / click resolve, `focused` from the first focus commit.
  let hovered: Selection | null = null;
  let selected: Selection | null = null;
  let focused: Selection | null = null;

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
  function galaxyInfoFor(sel: GalaxySelection): GalaxyInfo | null {
    const c = getCloud(sel.source);
    if (!c) return null;
    if (sel.localIdx < 0 || sel.localIdx >= c.count) return null;
    return buildGalaxyInfo(c, sel.localIdx, sel.source, getFamousMeta());
  }

  /**
   * Resolve a Selection to its expanded `FocusableTarget` (GalaxyInfo
   * | StructureRecord), or null.  Galaxy variant uses the cloud
   * lookup; POI variant resolves through `getPoi` (which the engine
   * wires to `state.data.structures.byId`).  Unknown POI ids resolve to
   * null — fire-the-callback-with-null is the right semantics for a
   * stale id pick.
   */
  function resolveTarget(sel: Selection | null): FocusableTarget | null {
    if (sel === null) return null;
    return sel.kind === 'galaxy' ? galaxyInfoFor(sel) : getPoi(sel.id);
  }

  function setHovered(sel: Selection | null): void {
    if (selectionEq(sel, hovered)) return;
    hovered = sel;
    cb.selection?.onHoverChange?.(resolveTarget(sel));
  }

  function setSelected(sel: Selection | null, prebuiltInfo?: GalaxyInfo | null): void {
    if (selectionEq(sel, selected)) return;
    selected = sel;
    // `prebuiltInfo` short-circuits the cloud lookup for the
    // `selectByAlias` race window — see the module header for the
    // pre-GPU-upload story.  Galaxy-only escape hatch; POI ids
    // resolve directly through the POI table.
    const target =
      sel !== null && sel.kind === 'galaxy' && prebuiltInfo !== undefined
        ? prebuiltInfo
        : resolveTarget(sel);
    cb.selection?.onSelectChange?.(target);
  }

  /**
   * Update the focus slot and fan out `cb.camera.onFocusChange`.
   * Symmetric with `setSelected`: the cluster-focus fade reads
   * `focused()` in `runFrame`, while React mirrors the same target
   * into the `#focus=` / `#poi=` URL hash via the callback.  One
   * setter for both consumers means they can't drift.  `prebuiltInfo`
   * short-circuits the cloud lookup for the `selectByAlias` race —
   * same escape hatch as `setSelected`; ignored for POI focuses.
   */
  function setFocused(sel: Selection | null, prebuiltInfo?: GalaxyInfo | null): void {
    if (selectionEq(sel, focused)) return;
    focused = sel;
    const target =
      sel !== null && sel.kind === 'galaxy' && prebuiltInfo !== undefined
        ? prebuiltInfo
        : resolveTarget(sel);
    cb.camera?.onFocusChange?.(target);
  }

  function destroy(): void {
    // Release internal refs — purely defensive (engine is a singleton,
    // remounts replace the whole subsystem instance anyway), but
    // matches the symmetric `destroy()` shape every sibling subsystem
    // exposes.  Subsequent `hovered()` / `selected()` / `focused()`
    // reads return null.
    hovered = null;
    selected = null;
    focused = null;
  }

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the selection subsystem is one
  // of the engine's ~13 teardown targets, and the shared shape lets
  // engine.destroy() iterate uniformly across the bag.
  const subsystem: SelectionSubsystem = {
    hovered: () => hovered,
    selected: () => selected,
    focused: () => focused,
    setHovered,
    setSelected,
    setFocused,
    destroy,
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
