/**
 * extractSelectionRow — turns a SelectionRef into a serializable SelectionRow
 * by touching the live engine resources in `ResolveDeps`. Table-dispatched on
 * the ref tag (never a predicate chain). The galaxy arm reads the cloud at the
 * index (null if the cloud isn't loaded yet — a deep link or a mid-flight tier
 * swap); the structure arm resolves the durable id to its already-serializable
 * record; the Milky Way arm is the static tag; the body arm resolves its seed
 * id against the static SCENE_BODIES table — no deps needed, the seeds are a
 * compile-time import, so a miss is a garbage id rather than "not loaded yet".
 *
 * This is the ONE engine-side step in the selection read path — the reconciler
 * saga calls it via getContext('resolveDeps'). Everything downstream
 * (buildFocusable) is pure and runs React-side.
 */
import { extractGalaxyRow } from './extractGalaxyRow';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
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
  // The position is copied (not aliased) because the row lands in the RTK
  // store, whose immutability middleware freezes state — freezing the shared
  // SCENE_BODIES seed would poison every other consumer of the constant.
  body: (ref) => {
    const body = SCENE_BODIES.find((b) => b.id === ref.id);
    if (!body) return null;
    return {
      type: 'body' as const,
      id: body.id,
      positionMpc: [body.positionMpc[0], body.positionMpc[1], body.positionMpc[2]],
      radiusKm: body.radiusKm,
    };
  },
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
