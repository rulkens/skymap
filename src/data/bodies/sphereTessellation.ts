/**
 * Body-sphere tessellation — the single home for how finely every SPHERE BODY's
 * UV mesh is subdivided (`uvSphereMesh(segments, rings)`).
 *
 * Four renderers build a mesh from these counts, and they want two different
 * things from it:
 *
 * - `starRenderer` (the Sun and other stars) and `planetRenderer` (the flat
 *   shaded fallback) DRAW it. The polygon's outline is the silhouette a viewer
 *   sees, so the two must agree exactly or a body changes shape as it crosses
 *   between them.
 * - `texturedBodyRenderer` and `bodyPickRenderer` ray-trace an analytic sphere
 *   and consume the mesh only as PROXY geometry — an invisible shell, inflated
 *   by `PROXY_SCALE` (`shaders/lib/analyticSphere.wesl`), whose only job is to
 *   make the fragment stage run over every pixel the true sphere can touch.
 *   Their silhouettes come from the ray test and not from this file at all.
 *
 * The two shell renderers deliberately do NOT read these. `atmosphereShellRenderer`
 * and `cloudShellRenderer` both run 128×64 because their meshes are proxy surfaces
 * whose own silhouettes carry the visible edge, and the cloud shell additionally
 * needs its facet sag to clear the globe beneath it (see the sag arithmetic in
 * `cloudShellRenderer`). Those are separate decisions with separate reasons, not
 * copies of this one, so they stay separate constants.
 *
 * ## Why 48×24 and not higher
 *
 * A UV sphere's silhouette is a polygon inscribed in the true circle, short of it
 * by `1 − cos(half-step)`. Both axes give a 3.75° half-step at 48×24, so at a
 * facet's edge midpoint the outline falls 0.214% of the radius inside the
 * analytic sphere, rising to roughly 0.43% (`1 − cos(5.3°)`) near a facet's
 * diagonal where both steps combine. For the two mesh renderers that deficit is
 * the drawn error, and raising the counts narrows it but never closes it — at a
 * vertex cost paid on every body every frame including the ones three pixels
 * wide: 48×24 is 1,225 vertices, 256×128 is 33,153. `uvSphereMesh` also returns
 * `Uint16Array` indices, so `(rings+1)·(segments+1) ≤ 65536` caps the practical
 * ceiling near 256×128.
 *
 * For the two analytic renderers nothing draws that polygon, so the deficit is
 * not an error at all — it is the FLOOR `PROXY_SCALE` has to clear. A proxy that
 * failed to strictly circumscribe the body would have its own outline clip the
 * analytic sphere it exists to reveal, shaving exactly the limb pixels the ray
 * test recovers. The margin arithmetic lives with the constant in
 * `analyticSphere.wesl` and is deliberately not restated here; what this file
 * owes it is counts coarse enough to stay cheap and fine enough that
 * `PROXY_SCALE` still covers the worst-case deficit.
 *
 * The atmosphere shell fragment (`shell/fragment.wesl`) reads none of this. It
 * intersects its ray with a purely physical ground radius —
 * `bottomRadius = planetRadiusKm / atmosphereTopKm` (`packAtmosphereUniforms.ts`)
 * — and has never tracked the tessellation. That is precisely why the surface
 * underneath it had to go analytic: a drawn polygon inside a perfectly round
 * occlusion test leaves a sliver along the limb that neither of them rasterises,
 * and the background shows through it. With `texturedBodyRenderer` on the ray
 * test the two radii are the same number and the counts here never enter.
 *
 * So the single-home status buys two things: `starRenderer` and `planetRenderer`
 * cannot draw two different spheres, and neither proxy can be coarsened past what
 * `PROXY_SCALE` covers without someone noticing. What it no longer has to buy is
 * pick/visual agreement — the pick and the textured body take their silhouette
 * from the same analytic ray test, so they agree by construction rather than by
 * two call sites reading one constant.
 */

/** Longitude slices around the equator. */
export const BODY_SPHERE_SEGMENTS = 48;

/** Latitude bands from pole to pole. */
export const BODY_SPHERE_RINGS = 24;
