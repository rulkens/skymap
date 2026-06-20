/**
 * extractSelectionRow — turns a SelectionRef into a serializable SelectionRow
 * by touching the live engine resources in `ResolveDeps`. Table-dispatched on
 * the ref tag (never a predicate chain). The galaxy arm reads the cloud at the
 * index (null if the cloud isn't loaded yet — a deep link or a mid-flight tier
 * swap); the structure arm resolves the durable id to its already-serializable
 * record; the Milky Way arm is the static tag.
 *
 * This is the ONE engine-side step in the selection read path — the reconciler
 * saga calls it via getContext('resolveDeps'). Everything downstream
 * (buildFocusable) is pure and runs React-side.
 */
import { extractGalaxyRow } from './extractGalaxyRow';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { ResolveDeps } from '../../../@types/engine/ResolveDeps';

const EXTRACT_ROW: {
  [K in SelectionRef['type']]: (
    ref: Extract<SelectionRef, { type: K }>,
    deps: ResolveDeps,
  ) => SelectionRow | null;
} = {
  galaxyCatalog: (ref, deps) =>
    extractGalaxyRow(deps.catalogs.get(ref.source), ref.index, ref.source, deps.famousMeta),
  structure: (ref, deps) => deps.structures.byId(ref.id),
  milkyWay: () => ({ type: 'milkyWay' as const }),
};

export function extractSelectionRow(
  ref: SelectionRef | null,
  deps: ResolveDeps,
): SelectionRow | null {
  if (ref === null) return null;
  // Narrow the dispatch through the ref tag; each arm receives its own ref shape.
  return (EXTRACT_ROW[ref.type] as (r: SelectionRef, d: ResolveDeps) => SelectionRow | null)(
    ref,
    deps,
  );
}
