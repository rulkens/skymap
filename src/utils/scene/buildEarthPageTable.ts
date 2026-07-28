import type { EarthResidentTile } from '../../@types/scene/EarthResidentTile';
import type { EarthTilePlan } from '../../@types/scene/EarthTilePlan';
import { earthTileColumns } from './earthTileColumns';

/**
 * buildEarthPageTable — the `windowSide × windowSide` RGBA8UI indirection the
 * fragment reads to turn a mesh uv into "which atlas slot, at which level, blended
 * how hard against the whole-globe base".
 *
 * One texel per window cell, row-major:
 *
 *   R  atlas slot column — `slot % slotsPerRow`
 *   G  atlas slot row    — `floor(slot / slotsPerRow)`
 *   B  the level `z` of the tile occupying that cell
 *   A  blend weight against the whole-globe base, 0..255
 *
 * A cell no resident tile covers keeps `A = 0`, which the fragment reads as
 * "sample the base and nothing else". That is the identity case, and it is what
 * makes the entire virtual texture strictly additive: an empty atlas, a failed
 * manifest, ground beyond the window and frame one of a descent all render
 * bit-identically to the picture without this feature. There is no hole state to
 * design around because there is no state that is not either "a tile" or "the
 * base".
 *
 * ## Property one: always rebuilt whole, never patched
 *
 * The whole table is produced from scratch on every residency change and uploaded
 * in one `writeTexture`. The tempting alternative — patching the cells that
 * changed — is what the project's recorded "eviction granularity must match slot
 * granularity" landmine is about, and declining it is what makes that landmine
 * structurally unreachable here rather than merely avoided by care. One atlas slot
 * holds exactly one tile, the atlas's own slot map is the single authoritative
 * home for residency, and this function is a pure projection of that map. A texel
 * naming a slot that has since been recycled under a different tile cannot exist,
 * because no texel survives a rebuild.
 *
 * The reason that is affordable at all is the window (see `EarthTilePlan`): 128
 * cells square is 64 KB, so a full rewrite stays in the noise. A page table sized
 * to the deepest level's full grid would be hundreds of megabytes and the rebuild,
 * not the allocation, is what would kill it — at which point patching would start
 * to look necessary and the landmine would be back.
 *
 * ## Property two: resident tiles are written in INCREASING `z`
 *
 * A finer tile therefore overwrites its coarse ancestor's cells, and every cell
 * ends up naming the finest resident ancestor covering it — with no search and no
 * per-cell loop over levels. That single ordering IS the graceful-degradation
 * mechanism: an area whose level-11 tile is still in flight keeps sampling its
 * level-8 ancestor for as long as the finer one takes to land, so refinement is
 * progressive from the base upward, which is also the order the planner descends
 * its quadtree in.
 *
 * ## Whatever is resident is projected, not whatever was requested
 *
 * The plan's request list is deliberately NOT used to filter. A tile that is
 * resident but no longer requested is precisely the coarse ancestor that should
 * still be covering ground while a finer one loads; dropping it would open the
 * hole that property two exists to prevent. The plan contributes only the window
 * (`zWin`, `winX0`, `winY0`), which is the coordinate system the cells live in.
 */
export function buildEarthPageTable(input: {
  /** Every tile currently in the atlas, in any order. A pure projection of the
   *  atlas's own slot map, which is the single authoritative home for residency. */
  readonly resident: readonly EarthResidentTile[];
  readonly plan: EarthTilePlan;
  readonly slotsPerRow: number;
  readonly windowSide: number;
  readonly tilePx: number;
}): Uint8Array {
  const { resident, plan, slotsPerRow, windowSide, tilePx } = input;

  const table = new Uint8Array(windowSide * windowSide * 4);
  const cols = earthTileColumns(plan.zWin, tilePx);

  // Sorted by level — property two. Sorting a handful of entries (the atlas
  // holds 64 slots) beats the alternative of walking the window's tens of
  // thousands of cells once per level to find the same few dozen tiles.
  const entries = resident.filter((entry) => {
    // Finer than the window's own level, so it covers a quarter of a cell or
    // less. Naming it would make the rest of that cell sample the wrong ground,
    // since the fragment derives its within-tile uv from the level in `B`. Such
    // a tile is a leftover from a lower camera; it waits for the window to
    // deepen again, or for the LRU to reclaim it.
    return entry.tile.z <= plan.zWin;
  });
  entries.sort((a, b) => a.tile.z - b.tile.z);

  for (const entry of entries) {
    // A tile at level `z` covers `span` cells each way at the window's level.
    const span = 1 << (plan.zWin - entry.tile.z);
    const x0 = entry.tile.x * span;
    const y0 = entry.tile.y * span;

    // Latitude is not periodic, so the row overlap is one contiguous range and
    // is clipped up front — a level-5 tile spans 256 rows at z13 and the window
    // holds at most 128 of them.
    const jStart = Math.max(0, plan.winY0 - y0);
    const jEnd = Math.min(span, plan.winY0 + windowSide - y0);
    if (jEnd <= jStart) continue;

    const col = entry.slot % slotsPerRow;
    const row = Math.floor(entry.slot / slotsPerRow);
    // Clamped rather than trusted: `Uint8Array` wraps a negative assignment
    // round to 255, which would read as "fully opaque tile" — the loudest
    // possible misreading of "not visible yet".
    const alpha = Math.max(0, Math.min(255, Math.round(entry.weight * 255)));

    for (let j = jStart; j < jEnd; j++) {
      const rowBase = (y0 + j - plan.winY0) * windowSide;
      for (let i = 0; i < span; i++) {
        // Longitude IS periodic, hence the same wrapping subtraction the
        // planner's window clip and the fragment's lookup both perform. It is
        // per-column rather than clipped up front because a tile can enter the
        // window in two runs — once before the antimeridian and once after.
        const dx = (((x0 + i - plan.winX0) % cols) + cols) % cols;
        // Cells the window does not hold are simply not written: a coarse tile
        // straddling the window edge contributes the part it has, and the rest
        // of its ground falls back to the base. Demanding whole tiles instead
        // would put a resolution seam inside the window rather than at its
        // frontier.
        if (dx >= windowSide) continue;
        const at = (rowBase + dx) * 4;
        table[at] = col;
        table[at + 1] = row;
        table[at + 2] = entry.tile.z;
        table[at + 3] = alpha;
      }
    }
  }

  return table;
}
