import type { Selection } from '../../../@types/engine/subsystems/Selection';

/**
 * poiIdOf — unwrap a Selection to its POI id, or null when nothing (or a
 * non-POI, e.g. a galaxy) is selected.
 *
 * The selection subsystem's `selected()` / `focused()` both return the
 * discriminated `Selection | null`, and both the marker and label producers
 * want the same thing: "if a POI is the current select/focus, give me its id,
 * otherwise null (so a galaxy select bumps/recedes no ring)." That unwrap was
 * duplicated verbatim in two producers; this is the single home for it.
 */
export function poiIdOf(sel: Selection | null): string | null {
  return sel !== null && sel.kind === 'poi' ? sel.id : null;
}
