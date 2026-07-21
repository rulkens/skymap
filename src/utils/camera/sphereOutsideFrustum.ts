/**
 * sphereOutsideFrustum — the conservative sphere-vs-frustum reject test that
 * lets the star cull skip whole nodes whose bounding sphere can't possibly
 * touch the view volume.
 *
 * ### The identity this uses
 *
 * `frustumPlanesFromViewProj` hands us six unit-normalized planes
 * `(nx, ny, nz, d)`, each oriented so that `nx·x + ny·y + nz·z + d` is the
 * SIGNED Euclidean distance from the point `(x,y,z)` to that plane, positive on
 * the inside (the frustum interior is the intersection of the six positive
 * half-spaces). A sphere of radius `r` centred at that point lies ENTIRELY on
 * the outside of a given plane exactly when that signed distance is more
 * negative than `-r` — the whole sphere, apex included, sits past the plane. If
 * that holds for even one plane the sphere cannot intersect the frustum, so we
 * can reject it. We stop at the first such separating plane; there's no need to
 * find the "most" separating one.
 *
 * ### Why the test is one-sided (and why that's the safe side)
 *
 * This is a CONSERVATIVE cull, and the two error directions are not symmetric:
 *
 *   - A false NEGATIVE — reporting `false` (keep) for a sphere that's actually
 *     off-screen — costs only the vertex work of drawing a node that ends up
 *     contributing nothing. Harmless.
 *   - A false POSITIVE — reporting `true` (drop) for a sphere that's actually
 *     visible — is a VISUAL BUG: stars that should be on screen wink out.
 *     Forbidden.
 *
 * So the predicate answers the deliberately weak question "is this sphere
 * PROVABLY, fully outside at least one plane?" and defaults to keeping anything
 * it can't prove out. A sphere straddling a plane (centre outside, radius
 * reaching back across) reads as kept, which is correct — it might be partly
 * visible. The alternative, an exact frustum-intersection test, would trade
 * that safe slack for corner-case math (edge and vertex regions of the frustum)
 * that buys nothing here: the sphere is a loose bound on the node already, so a
 * loose plane test on top of it is the honest granularity.
 *
 * ### Hot path
 *
 * Called once per candidate node — on the order of 46k times per frame — so
 * this stays allocation-free and branch-cheap: a straight indexed walk of the
 * 24-float plane buffer with an early return on the first plane that separates,
 * no destructuring, no temporaries beyond the running dot product.
 *
 * @param planes  The 24 floats from `frustumPlanesFromViewProj`: six
 *                unit-normalized `(nx, ny, nz, d)` planes, contiguous.
 * @param x       Sphere-centre world/rebased X (same frame the planes came from).
 * @param y       Sphere-centre Y.
 * @param z       Sphere-centre Z.
 * @param radius  Sphere radius in the same units.
 * @returns       `true` iff the sphere is fully outside at least one plane (safe
 *                to drop); `false` if it might touch the frustum (must keep).
 */

export function sphereOutsideFrustum(
  planes: Float32Array,
  x: number,
  y: number,
  z: number,
  radius: number,
): boolean {
  const negRadius = -radius;
  for (let base = 0; base < 24; base += 4) {
    const signed = planes[base]! * x + planes[base + 1]! * y + planes[base + 2]! * z + planes[base + 3]!;
    if (signed < negRadius) return true;
  }
  return false;
}
