/**
 * extractSelectionRow — turns a SelectionRef into a serializable SelectionRow
 * by touching the live engine resources in `ResolveDeps`. Table-dispatched on
 * the ref tag (never a predicate chain). The galaxy arm reads the cloud at the
 * index (null if the cloud isn't loaded yet — a deep link or a mid-flight tier
 * swap); the structure arm resolves the durable id to its already-serializable
 * record; the Milky Way arm is the static tag; the body arm resolves its seed
 * id against the static SCENE_BODIES table and its position from the live
 * body-state snapshot at the caller's `simDays` — no deps needed, both are
 * compile-time imports, so a miss is a garbage id rather than "not loaded yet".
 *
 * This is the ONE engine-side step in the selection read path — the reconciler
 * saga calls it via getContext('resolveDeps'). Everything downstream
 * (buildFocusable) is pure and runs React-side.
 */
import { extractGalaxyRow } from './extractGalaxyRow';
import { resolveStarRecord } from './resolveStarRecord';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { SOLAR_RADIUS_KM } from '../../../data/bodies/solarRadiusKm';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { ResolveDeps } from '../../../@types/engine/ResolveDeps';

const EXTRACT_ROW: {
  [K in SelectionRef['type']]: (
    ref: Extract<SelectionRef, { type: K }>,
    deps: ResolveDeps,
    simDays: number,
  ) => SelectionRow | null;
} = {
  galaxyCatalog: (ref, deps) =>
    extractGalaxyRow(deps.catalogs.get(ref.source), ref.index, ref.source, deps.famousGalaxiesMeta),
  structure: (ref, deps) => deps.structures.byId(ref.id),
  milkyWay: () => ({ type: 'milkyWay' as const }),
  zoneOfAvoidance: () => ({ type: 'zoneOfAvoidance' as const }),
  // Every scene body reads its world position from the body-state snapshot at
  // the caller's live `simDays` — the same derive the render layers read — so a
  // selected body's stored position tracks the one it is drawn at rather than a
  // separately-baked seed field. This resolver runs OFF the frame path (the
  // reconciler / focus-tween sagas and clip-foci resolution), so the caller
  // must derive `simDays` itself (`deriveSimDays(time, nowMs)`) rather than
  // routing through the per-frame `sceneBodyStates` seam. The position is a
  // SNAPSHOT taken once at extraction time, not tracked live — a consumer that
  // needs the position to stay current as the body moves must re-derive via
  // `liveBodyPosition`, not re-read this row. It is copied (not aliased)
  // because the row lands in the RTK store, whose immutability middleware
  // freezes state — freezing the shared anchor position would poison every
  // other consumer of the constant.
  body: (ref, _deps, simDays) => {
    const body = SCENE_BODIES.find((b) => b.id === ref.id);
    if (!body) return null;
    // Total: a seed is either an `ORBITAL_ELEMENTS` row or a `SCENE_ANCHORS`
    // one, and the snapshot holds both.
    const p = deriveBodyStates(simDays).get(body.id)!.positionMpc;
    return {
      type: 'body' as const,
      id: body.id,
      label: body.label,
      positionMpc: [p[0], p[1], p[2]],
      radiusM: body.radiusM,
      // Only the AnchorPointBody arm of the SceneBody union carries this field.
      standoffRadii: 'standoffRadii' in body ? body.standoffRadii : undefined,
    };
  },
  // The star's physical fields are resolved off the LIVE catalog through the
  // shared resolveStarRecord (never re-derived here — that resolver owns the
  // record→world math so the row lands exactly where the sprite drew). A null
  // catalog (cloud not loaded) or an out-of-range index → null, letting the
  // reconciler retry rather than materialise a garbage row.
  star: (ref, deps) => {
    const catalog = deps.stars.current();
    if (!catalog) return null;
    const record = resolveStarRecord(catalog, ref.index);
    return record
      ? {
          type: 'star' as const,
          index: ref.index,
          positionMpc: record.positionMpc,
          absMag: record.absMag,
          bpRp: record.bpRp,
          // No per-star size in the bin — stamp the one representative radius
          // (the Sun's) so framing/gating treat the star as a discrete body.
          // Wire/authored value is km; runtime convention is metres.
          radiusM: SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M,
        }
      : null;
  },
};

export function extractSelectionRow(
  ref: SelectionRef | null,
  deps: ResolveDeps,
  simDays: number,
): SelectionRow | null {
  if (ref === null) return null;
  // Narrow the dispatch through the ref tag; each arm receives its own ref shape.
  return (
    EXTRACT_ROW[ref.type] as (r: SelectionRef, d: ResolveDeps, s: number) => SelectionRow | null
  )(ref, deps, simDays);
}
