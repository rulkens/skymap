/**
 * starNodeOriginRelCamMpc — the star renderer's precision seam: an octree
 * node's world-space box origin, expressed *relative to the camera* in
 * Megaparsecs, computed entirely in float64 before the renderer narrows it to
 * float32 for upload.
 *
 * ── Why subtract the camera in f64, before any f32 narrow ──────────────────
 *
 * A star catalog quantizes positions onto a ~78 pc leaf grid whose corner
 * (`catalog.gridOrigin`) can sit thousands of parsecs from the Sun. Converted
 * to the scene's Mpc frame a node origin is a number like 1.078e-3 Mpc, and the
 * camera — closing to within light-hours of a star during the local-map
 * approach — is a near-equal number like 1.000e-3 Mpc. Their *difference* is
 * the tiny camera-relative vector the shader actually needs (~7.8e-5 Mpc here),
 * but float32 holds only ~7 significant digits: narrowing each operand FIRST
 * throws away the low bits that carry the difference, and the reconstructed
 * point sprite quantizes onto a coarse grid and visibly jitters as the camera
 * approaches. (This is the same catastrophic-cancellation trap
 * `starPointsLayer` documents for the seeded point anchors.)
 *
 * The fix is to do the large-minus-large subtraction here, in JS numbers
 * (float64), and hand the renderer only the small result. Neither operand the
 * f32 shader later multiplies carries a large-number-cancellation hazard.
 *
 * ── One formula for leaves and aggregates, via 2^level ─────────────────────
 *
 * A leaf (`level 0`) owns one grid cell; an aggregate (`level > 0`) owns a box
 * spanning `2^level` leaf cells per axis, rooted at the same Morton-decoded
 * grid coordinate. So both are reconstructed by a single expression — the leaf
 * is just the `level === 0` case where `2^level === 1`:
 *
 *   nodeOriginPc = gridOrigin + mortonDecode3(mortonIndex) · (cellEdgePc · 2^level)
 *   cellScaleMpc = cellEdgePc · 2^level · PC_TO_MPC
 *
 * This inverts exactly the box scaling `buildStarOctree` applies when it
 * re-quantizes an aggregate's flux centroid into its `2^level` box (see that
 * module's "Coordinate frame" docblock). The shader then reconstructs a
 * record's world position from the returned pair as
 *
 *   worldRelCam = originRelCamMpc + (offset / 1024) · cellScaleMpc
 *
 * where `offset` is the record's in-cell 10-bit integer (0..1023).
 *
 * There is no division anywhere in this seam, so a node coincident with the
 * camera (the Sun's own cell during Sun-exclusion) yields `[0, 0, 0]` and a
 * finite `cellScaleMpc` — no divide-by-zero to guard.
 */
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { StarCatalog } from '../../../../@types/data/starCatalog/StarCatalog';
import type { StarCatalogNode } from '../../../../@types/data/starCatalog/StarCatalogNode';
import { mortonDecode3 } from '../../../../utils/math/mortonDecode3';
import { SCALE_UNITS } from '../../../../data/scaleUnits';

export function starNodeOriginRelCamMpc(
  catalog: StarCatalog,
  node: StarCatalogNode,
  camPosMpc: Vec3,
): { originRelCamMpc: Vec3; cellScaleMpc: number } {
  // Box edge in leaf cells: 1 for a leaf, 2^level for an aggregate.
  const boxCells = 2 ** node.level;
  const cellEdgePc = catalog.cellEdgePc * boxCells;

  const [gx, gy, gz] = catalog.gridOrigin;
  const [cx, cy, cz] = mortonDecode3(node.mortonIndex);

  // Node origin in parsecs (f64), then converted to Mpc and rebased onto the
  // camera — the large-minus-large subtraction stays in f64 so the small
  // camera-relative result keeps every significant bit the f32 upload needs.
  const pcToMpc = SCALE_UNITS.PC_TO_MPC;
  const originRelCamMpc: Vec3 = [
    (gx + cx * cellEdgePc) * pcToMpc - camPosMpc[0],
    (gy + cy * cellEdgePc) * pcToMpc - camPosMpc[1],
    (gz + cz * cellEdgePc) * pcToMpc - camPosMpc[2],
  ];

  const cellScaleMpc = cellEdgePc * pcToMpc;

  return { originRelCamMpc, cellScaleMpc };
}
