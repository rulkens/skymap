/**
 * decimateHeightGrid — every other post of a height grid, both axes.
 *
 * Point decimation, never a 2×2 average (R1, unlike the albedo operator):
 * level `L`'s lattice is exactly every other point of level `L + 1`'s, so
 * this keeps `h_L(p) ≡ h_{L+1}(p)` bit-identical at every shared point
 * (§5.4.3) — an average would move those points and reopen the cracks the
 * coarse-patch edge collapse relies on not existing.
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
