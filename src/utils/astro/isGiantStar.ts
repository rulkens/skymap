/**
 * Split a Gaia field star into dwarf vs. giant from its position on the
 * colour–magnitude diagram, so `starTeffK` can pick the right Mucciarelli+21
 * relation (arXiv:2106.03882).
 *
 * A photometric split, not a spectroscopic one: the red-giant branch sits in
 * the bright-and-red corner of the CMD, so a star is called a giant only when
 * it is both intrinsically bright (small absolute magnitude) and red. The
 * paper's two relations differ by only 10–20 K at the log g = 3 boundary, so a
 * mis-classified star near the split costs at most tens of kelvin — well inside
 * the noise of an order-of-magnitude estimate.
 *
 * The absolute magnitude is the LUT-quantised value carried on the star record;
 * no extinction correction is applied, so a heavily reddened distant star reads
 * artificially red and may be called a giant when it is not.
 */
export function isGiantStar(absMagG: number, bpRp: number): boolean {
  return absMagG < 4.0 && bpRp > 0.9;
}
