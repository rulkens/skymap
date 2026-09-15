/**
 * decimateHeightGrid — every other post of a height grid, both axes.
 *
 * Point decimation, never an average (R1): level `L`'s lattice is exactly
 * every other point of level `L + 1`'s, so this makes `h_L(p) ≡ h_{L+1}(p)`
 * bit-identical at every shared point (§5.4.3). A 2×2 average — the albedo
 * operator — would move those points by a fraction of a metre and reintroduce
 * the cracks the coarse-patch edge collapse relies on not existing.
 *
 * Odd input dimensions, so `(n + 1) / 2` out: a 129-post edge decimates to 65,
 * which is exactly one quadrant of the parent's own 129.
 */
export function decimateHeightGrid(
  fine: Float32Array,
  nxFine: number,
  nyFine: number,
): Float32Array {
  const nx = (nxFine + 1) >> 1;
  const ny = (nyFine + 1) >> 1;
  const coarse = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) coarse[j * nx + i] = fine[2 * j * nxFine + 2 * i]!;
  }
  return coarse;
}
