import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';

function cellName(latDeg: number, lonDeg: number): string {
  const ns = `${latDeg < 0 ? 'S' : 'N'}${String(Math.abs(latDeg)).padStart(2, '0')}`;
  const ew = `${lonDeg < 0 ? 'W' : 'E'}${String(Math.abs(lonDeg)).padStart(3, '0')}`;
  return `${ns}/${ns}${ew}`;
}

/**
 * skadiCellsForBounds — the `<N55>/<N55E012>` cells covering `box`, in
 * lat-then-lon ascending order.
 *
 * A cell is named by its SOUTH-WEST corner, so `floor` is the whole rule,
 * including on the negative side (lon −0.4 is in `W001`, not `E000`) and on
 * an exact whole-degree edge, where the box's own `floor` names the cell that
 * carries that post as its 3601st row or column. `skadiHeightSource` resolves
 * a boundary post the same way, so the fetcher and the reader can't disagree
 * about which cell a coastline post lives in.
 */
export function skadiCellsForBounds(box: LonLatBounds): string[] {
  const cells: string[] = [];
  for (let lat = Math.floor(box.south); lat <= Math.floor(box.north); lat++) {
    for (let lon = Math.floor(box.west); lon <= Math.floor(box.east); lon++) {
      cells.push(cellName(lat, lon));
    }
  }
  return cells;
}
