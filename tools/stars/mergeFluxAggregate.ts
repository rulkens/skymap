/**
 * mergeFluxAggregate — collapse ≤8 child nodes into one flux-mip aggregate.
 *
 * The star catalog's in-file octree stores, at every interior node, a single
 * record that stands in for the whole subtree beneath it: a "flux mip". At a
 * distance where thousands of individual stars smear into an unresolved glow,
 * the renderer draws that one aggregate instead of the leaves and gets the same
 * integrated light for a fraction of the vertices. This function computes that
 * aggregate from its children.
 *
 * ── Why the aggregate stores a MEAN flux, not a summed flux ────────────────
 *
 * The physically meaningful thing an aggregate represents is the *sum of the
 * light* its children emit — but that sum is exactly what we must NOT quantize
 * into the record, and the reason is the record's 7-bit magnitude LUT. That LUT
 * (`starCatalogFormat.ts`) is sized for a *single star*: its window is
 * `[-6.0, +18.32]` mag, bracketing hot O stars at the bright end and late-M
 * dwarfs at the faint end. A subtree of thousands of stars is `2.5·log10(N)`
 * magnitudes brighter than any one of them — for `N ≈ 10⁴` that is ~10 mag past
 * the `-6.0` floor. So a *summed*-flux magnitude saturates LUT index 0, and
 * whole regions of aggregates collapse to one indistinguishable brightness (a
 * visible box lattice in the far field, and a total-flux jump the instant the
 * LOD refines a clamped node into its unclamped children).
 *
 * The fix is to store the magnitude of the subtree's *mean* star flux instead.
 * A mean of in-window fluxes is itself in-window by construction, so it can
 * never clamp. The record then carries `meanMag = -2.5·log10(Σf / N)`, and the
 * renderer reconstructs the physically-correct summed flux on the GPU by
 * multiplying the record's per-star flux back up by the subtree star count `N`
 * (which the runtime derives from the node table — see the vertex shader and
 * `subtreeStarCounts.ts`). Summing on read rather than on write keeps the
 * additive-flux photometry exact while keeping every stored magnitude inside
 * the single-star window.
 *
 * So this merge carries `(totalFlux, starCount)` up the tree as a running f64
 * sum — the mean is never re-quantized between aggregate levels, and only the
 * final record encode (in `buildStarOctree`) quantizes it. Merging from an
 * already-quantized child *aggregate* (re-expanding its LUT-rounded mean at each
 * level) would compound the very rounding this design avoids.
 *
 * The one place quantization *does* enter the sum is the leaf seed: a leaf's
 * `totalFlux` is the flux its 6-byte *record* represents (`fluxFromAbsMag` of
 * the dequantized stored index), not its raw magnitude. That is deliberate and
 * load-bearing — the aggregate must sum exactly what its refined leaves will
 * deposit on screen, so drawing an aggregate and drawing its children conserve
 * flux. Seeding from the raw magnitude instead would let a star below the LUT's
 * bright floor (a bad parallax → an absurd luminosity) inject a flux orders of
 * magnitude larger than its clamped record ever draws, dragging every ancestor
 * mean to the floor. See `buildStarOctree`'s leaf construction.
 *
 * ── Why flux-weighting for position and colour ────────────────────────────
 *
 * Magnitude is a *logarithmic* measure of flux, so position and colour are
 * averaged *weighted by flux*: the bright children dominate the aggregate's
 * apparent location and tint exactly as they dominate the light the viewer
 * sees. A flat centroid would let a swarm of faint stars drag the glow away
 * from the one bright star that actually carries the subtree's light.
 *
 * Flux is computed with an arbitrary but consistent zero-point
 * (`f = 10^(−0.4·absMag)`, i.e. zero-point magnitude 0 — see `fluxFromAbsMag`).
 * Only ratios matter for the weighting, and the mean→magnitude inverse
 * (`aggregateMeanAbsMag`) uses the same zero-point, so it cancels and the stored
 * magnitude is on the input scale.
 *
 * Pure and unit-agnostic in `position`: the caller passes positions in whatever
 * frame it will re-quantize the result back into (the octree build works in
 * leaf-cell grid units). Throws on an empty `children` array — a flux merge of
 * nothing has no meaningful centroid or magnitude, so it is a caller bug.
 */
import type { Vec3 } from '../../src/@types/math/Vec3';

/**
 * One node participating in a flux merge — a leaf star (`starCount === 1`) or a
 * lower aggregate. Carries the subtree summary *unquantized*: the summed linear
 * flux and the star count feed the next level's mean, and the record's stored
 * magnitude is only derived from them at final encode (`aggregateMeanAbsMag`).
 */
export type FluxNode = {
  /** Position in the caller's frame; the aggregate lands at the flux centroid. */
  readonly position: Vec3;
  /** Summed linear flux of the subtree (zero-point 0 — see `fluxFromAbsMag`). */
  readonly totalFlux: number;
  /** Number of leaf stars the subtree contains — the divisor for the mean. */
  readonly starCount: number;
  /** Flux-weighted Gaia BP-RP colour index. */
  readonly bpRp: number;
};

/**
 * Linear flux of a single star from its absolute magnitude, on the format's
 * zero-point-0 scale (`f = 10^(−0.4·M)`). The exact inverse the vertex shader
 * applies to a dequantized magnitude, so a leaf star's `totalFlux` and the
 * shader's reconstructed flux agree bit-for-bit up to fp.
 */
export function fluxFromAbsMag(absMag: number): number {
  return Math.pow(10, -0.4 * absMag);
}

/**
 * Magnitude of the subtree's MEAN star flux — the value an aggregate record
 * stores. Because a mean of in-window fluxes stays in-window, this is
 * guaranteed to land inside the single-star LUT window and never clamps (unlike
 * `-2.5·log10(totalFlux)`, the summed magnitude, which does — see the header).
 */
export function aggregateMeanAbsMag(node: FluxNode): number {
  return -2.5 * Math.log10(node.totalFlux / node.starCount);
}

export function mergeFluxAggregate(children: readonly FluxNode[]): FluxNode {
  if (children.length === 0) {
    throw new Error(
      'mergeFluxAggregate: cannot merge an empty children array — an aggregate ' +
        'must stand in for at least one node, so an empty merge is a caller bug.',
    );
  }
  let totalFlux = 0;
  let starCount = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  let colour = 0;

  for (const child of children) {
    // Flux-weight position/colour; sum flux and count UNQUANTIZED for the mean.
    const w = child.totalFlux;
    totalFlux += w;
    starCount += child.starCount;
    x += w * child.position[0];
    y += w * child.position[1];
    z += w * child.position[2];
    colour += w * child.bpRp;
  }

  return {
    position: [x / totalFlux, y / totalFlux, z / totalFlux],
    // Carried up unquantized; `aggregateMeanAbsMag` derives the stored magnitude.
    totalFlux,
    starCount,
    bpRp: colour / totalFlux,
  };
}
