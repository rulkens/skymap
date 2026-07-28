/**
 * EarthTileManifest — what the bake wrote, read once by the runtime before it
 * requests a single tile.
 *
 * Three facts the runtime cannot know on its own: the tile edge the pyramid was
 * cut at, how deep each kind actually goes, and what imagery it came from. The
 * first two are what the planner clamps against — asking for a level that was
 * never baked is a sustained 404 storm on every close approach, and assuming a
 * tile edge the bake did not use puts the fragment's cell arithmetic a level out
 * of step with the planner's.
 *
 * ### Why a fetched JSON and not committed codegen
 *
 * The project already has the codegen pattern (`bodyAtlas.generated.ts`), and it
 * wins when a fact is needed at boot and a round trip would cost visible latency.
 * Neither holds here: the virtual texture engages only on close approach, by
 * which point one small JSON has cost nothing, and re-baking a deeper pyramid
 * ought to be a data change rather than a code deploy. A missing or unparseable
 * manifest degrades the whole feature to base-only, which is the identity case,
 * so there is nothing to fail loudly about either.
 *
 * This single type is imported by both ends of the contract — the emit site in
 * `tools/textures/buildEarthTiles.ts` and the one parse site
 * (`fetchEarthTileManifest`) — so what was written and what may be read cannot
 * drift into disagreeing shapes.
 *
 * `levels` and `builtFrom` are `Partial`, not total, over `EarthTileKind`. A
 * surface-only bake has no `normal` entry on disk, and a total
 * `Record<EarthTileKind, ...>` would force one to be invented — a level range
 * for a pyramid that does not exist is exactly the plausible lie the manifest
 * exists to prevent. Every read goes through an optional lookup and a
 * null/undefined check, which is the point: absence is a real, representable
 * state, not an implementation detail papered over by the type.
 *
 * The shape is otherwise deliberately small: anything the runtime can derive
 * (column counts, metres per texel, the window side) is derived, so the
 * manifest cannot disagree with the ladder.
 */

import type { EarthTileKind } from '../data/EarthTileKind';

export type EarthTileManifest = {
  readonly tilePx: number;
  readonly levels: Partial<Record<EarthTileKind, { readonly min: number; readonly max: number }>>;
  /** Source id + attribution + vintage, so a stale or mis-licensed bake is diagnosable. */
  readonly builtFrom: Partial<Record<EarthTileKind, string>>;
};
