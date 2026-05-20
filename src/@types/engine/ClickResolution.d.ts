import type { GalaxyInfo } from './GalaxyInfo';
import type { GalaxySelection } from './subsystems/Selection';
import type { PointOfInterest } from './subsystems/PointOfInterest';

/**
 * Result of resolving a click.  See the module-level docstring of
 * `services/engine/interaction/clickHandler.ts` for the full
 * state-machine commentary.
 *
 * Three variants:
 *
 *   - `'clear'`  — the picker reported background, or a POI hit had no
 *                  matching record in the resolver's POI table.  The
 *                  engine should drop both the galaxy selection and
 *                  any pinned POI focus.
 *
 *   - `'select'` — a survey-galaxy hit.  The `selection` field carries
 *                  the (source, localIdx) pair the picker decoded
 *                  from the r32uint texture's packed value; the engine
 *                  forwards it straight to `setSelected` for the halo
 *                  + InfoCard updates.  `info` is the matching GalaxyInfo
 *                  when one could be built (or null if the cloud isn't
 *                  loaded or the localIdx is out of range — see the
 *                  pre-extraction parity rule documented in clickHandler.ts).
 *
 *   - `'poi'`    — a cluster / supercluster / void ring hit that
 *                  resolved to a PointOfInterest record.  The engine's
 *                  ring-pick pipeline encodes one of three categories
 *                  in the high 5 bits of the pick texel; the click
 *                  resolver maps `(category, poiIndex)` through the
 *                  caller-supplied `resolvePoi` callback to recover
 *                  the full POI metadata (name, worldPos, radius, ...).
 *                  See `selectionEncoding.ts` for the encoding details
 *                  and Plan 3 §6.2 for the per-category allocation.
 *
 * The 'poi' shape carries the full `PointOfInterest` so callers don't
 * have to re-lookup by id — the resolver already did the index → POI
 * walk and there's no reason to throw the result away just to make
 * the engine repeat it.
 */
export type ClickResolution =
  | { kind: 'clear' }
  | {
      kind: 'select';
      selection: GalaxySelection;
      info: GalaxyInfo | null;
    }
  | { kind: 'poi'; poi: PointOfInterest };
