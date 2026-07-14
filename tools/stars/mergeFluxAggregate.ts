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
 * ── Why flux-weighting, not magnitude-averaging ───────────────────────────
 *
 * The tempting shortcut — average the children's magnitudes, average their
 * positions and colours — is wrong, because magnitude is a *logarithmic*
 * measure of flux, and the physically meaningful thing an aggregate represents
 * is the *sum of the light* its children emit. Averaging logarithms does not
 * commute with summing the underlying linear quantity.
 *
 * Concretely: two stars of equal absolute magnitude `m` each emit flux
 * `f = 10^(−0.4·m)`. Their combined light is `2f`, whose magnitude is
 *
 *     −2.5·log10(2f) = −2.5·log10(2) + m = m − 0.7526…
 *
 * i.e. the pair is ≈0.753 mag *brighter* than either star alone. A
 * magnitude-average would report `m` — losing the fact that two stars glow
 * more than one. So the aggregate magnitude is the magnitude of the *summed*
 * flux, and position and colour are averaged *weighted by flux*, so the bright
 * children dominate the aggregate's apparent location and tint exactly as they
 * dominate the light the viewer sees.
 *
 * Flux is computed with an arbitrary but consistent zero-point
 * (`f = 10^(−0.4·absMag)`, i.e. zero-point magnitude 0). Only ratios matter for
 * the weighting, and the sum→magnitude inverse (`−2.5·log10(Σf)`) uses the same
 * zero-point, so it cancels and the returned magnitude is on the input scale.
 *
 * Pure and unit-agnostic in `position`: the caller passes positions in whatever
 * frame it will re-quantize the result back into (the octree build works in
 * leaf-cell grid units). Throws on an empty `children` array — a flux merge of
 * nothing has no meaningful centroid or magnitude, so it is a caller bug.
 */
import type { Vec3 } from '../../src/@types/math/Vec3';

/** One node participating in a flux merge — a leaf star or a lower aggregate. */
export type FluxNode = {
  /** Position in the caller's frame; the aggregate lands at the flux centroid. */
  readonly position: Vec3;
  /** Absolute magnitude (logarithmic brightness). */
  readonly absMag: number;
  /** Gaia BP-RP colour index. */
  readonly bpRp: number;
};

export function mergeFluxAggregate(children: readonly FluxNode[]): FluxNode {
  if (children.length === 0) {
    throw new Error(
      'mergeFluxAggregate: cannot merge an empty children array — an aggregate ' +
        'must stand in for at least one node, so an empty merge is a caller bug.',
    );
  }
  let totalFlux = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  let colour = 0;

  for (const child of children) {
    // Linear flux from logarithmic magnitude; zero-point cancels in the inverse.
    const flux = Math.pow(10, -0.4 * child.absMag);
    totalFlux += flux;
    x += flux * child.position[0];
    y += flux * child.position[1];
    z += flux * child.position[2];
    colour += flux * child.bpRp;
  }

  return {
    position: [x / totalFlux, y / totalFlux, z / totalFlux],
    // Magnitude of the SUMMED flux — brighter than any single child.
    absMag: -2.5 * Math.log10(totalFlux),
    bpRp: colour / totalFlux,
  };
}
