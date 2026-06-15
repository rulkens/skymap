/**
 * selectionSubsystem — owns the engine's hover + select + focus state.
 *
 * Three slots, each holding an already-resolved `FocusableTarget`
 * (GalaxyInfo | StructureInfo) or null, forming the engine's attention
 * ladder: hover → select → focus.  The subsystem is a thin slot store:
 * setters dedupe via `targetEq` and fan out the STORED target to
 * `cb.selection.onHoverChange` / `onSelectChange` / `cb.camera.onFocusChange`.
 * It does no resolution of its own — callers resolve picks to targets (via the
 * pick-boundary helpers) before handing them in.  `setSelected` and
 * `setFocused` also own the render wake — callers never follow up with
 * `requestRender`.  `setHovered` is wake-free: it feeds only the React
 * InfoCard (no scene-side halo).
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
 * desync — there is exactly one setter.
 *
 * ### Resolution lives at the caller, not here
 *
 * Callers pass an already-resolved target, which defends the deep-link race —
 * a `selectByAlias` firing after the data-side catalog arrives but before the
 * GPU upload settles.  There is no internal lookup to race: whatever the caller
 * resolved is exactly what the slot stores and the callback receives.
 */

import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { SelectionSubsystem } from '../../../@types/engine/subsystems/SelectionSubsystem';
import type { CreateSelectionSubsystemInput } from '../../../@types/engine/subsystems/CreateSelectionSubsystemInput';
import { targetEq } from '../helpers/targetEq';

export function createSelectionSubsystem(input: CreateSelectionSubsystemInput): SelectionSubsystem {
  const { cb, requestRender } = input;

  // Closure-captured `let`s — genuinely inaccessible from outside.
  // All start null; the setters populate them with resolved targets.
  let hovered: FocusableTarget | null = null;
  let selected: FocusableTarget | null = null;
  let focused: FocusableTarget | null = null;

  function setHovered(target: FocusableTarget | null): void {
    if (targetEq(target, hovered)) return;
    hovered = target;
    cb.selection?.onHoverChange?.(target);
  }

  function setSelected(target: FocusableTarget | null): void {
    if (targetEq(target, selected)) return;
    selected = target;
    cb.selection?.onSelectChange?.(target);
    // Channel mouth owns the wake (see module header).
    requestRender();
  }

  function setFocused(target: FocusableTarget | null): void {
    if (targetEq(target, focused)) return;
    focused = target;
    cb.camera?.onFocusChange?.(target);
    // Wake — the focus change drives the cluster-isolation fade.
    requestRender();
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
