/**
 * annulusMesh — build a flat annulus (ring) in the local z = 0 plane with a
 * unit outer radius and an inner hole at `innerRatio`.
 *
 * Sibling of `uvSphereMesh`, for the scene's one non-spherical body — Saturn's
 * rings. The annulus is two concentric vertex rings joined by a strip of quads:
 *
 *   - the INNER ring, `segments + 1` vertices on the circle of radius
 *     `innerRatio` (u = 0);
 *   - the OUTER ring, `segments + 1` vertices on the unit circle (u = 1).
 *
 * The extra `+1` segment duplicates the seam vertex (angle 0 == angle 2π) so
 * the seam has vertices at both ends of the ring — the same seam-duplication
 * `uvSphereMesh` uses on longitude. Each quad cell (inner_s, outer_s,
 * outer_s+1, inner_s+1) is two triangles.
 *
 * ## Why outer radius = 1
 *
 * Authoring at unit outer radius means the body model matrix scales the whole
 * ring to its OUTER radius in Mpc — exactly the scale `composeBodyMvp` applies
 * to a unit sphere. So the ring rides the host planet's `composeBodyMvp(...,
 * outerRadiusMpc, orientation)` with no ring-specific transform, and its plane
 * is the body's equatorial plane because the annulus lives in local z = 0 and
 * the host orientation carries it.
 *
 * ## Radial uv
 *
 * `u` is the normalized radius: inner edge → 0, outer edge → 1, linear in
 * radius along each radial edge, so sampling a radial alpha strip at `u`
 * tracks the ring's real C-to-A structure. `v` is a constant 0.5 — the strip
 * is a single-row N×1 texture, so the row centre is the only meaningful v.
 *
 * `innerRatio == 0` is a valid degenerate input: the inner ring collapses to
 * the origin, giving a filled disc (the inner triangle of each quad has zero
 * area and rasterizes nothing). The ring renderer uses exactly that — a disc
 * whose hole is punched per-draw from the uniform inner ratio — so ONE geometry
 * serves any ring's proportions.
 */

import type { AnnulusMesh } from '../../@types/math/AnnulusMesh';

export function annulusMesh(segments: number, innerRatio: number): AnnulusMesh {
  // Two concentric rings, each with the seam vertex duplicated (s == segments
  // shares the world position of s == 0). Vertices are laid out inner-then-outer
  // per segment so a quad's four corners are contiguous pairs.
  const vertexCount = (segments + 1) * 2;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  let pi = 0;
  let ui = 0;
  for (let s = 0; s <= segments; s++) {
    const theta = (2 * Math.PI * s) / segments;
    const c = Math.cos(theta);
    const sn = Math.sin(theta);

    // Inner vertex (radius innerRatio, u = 0).
    positions[pi++] = innerRatio * c;
    positions[pi++] = innerRatio * sn;
    positions[pi++] = 0;
    uvs[ui++] = 0;
    uvs[ui++] = 0.5;

    // Outer vertex (radius 1, u = 1).
    positions[pi++] = c;
    positions[pi++] = sn;
    positions[pi++] = 0;
    uvs[ui++] = 1;
    uvs[ui++] = 0.5;
  }

  // Two CCW-from-+z triangles per segment quad. Per segment s the four corner
  // indices are inner_s = 2s, outer_s = 2s+1, inner_(s+1) = 2s+2, outer_(s+1) =
  // 2s+3. The ring draws two-sided (cullMode 'none'), so the winding only fixes
  // which face is "front" — not which is culled.
  const indices = new Uint16Array(segments * 6);
  let ii = 0;
  for (let s = 0; s < segments; s++) {
    const innerS = s * 2;
    const outerS = s * 2 + 1;
    const innerNext = (s + 1) * 2;
    const outerNext = (s + 1) * 2 + 1;

    // Triangle 1: inner_s → outer_s → outer_(s+1)
    indices[ii++] = innerS;
    indices[ii++] = outerS;
    indices[ii++] = outerNext;

    // Triangle 2: inner_s → outer_(s+1) → inner_(s+1)
    indices[ii++] = innerS;
    indices[ii++] = outerNext;
    indices[ii++] = innerNext;
  }

  return { positions, uvs, indices };
}
