/**
 * Body-sphere tessellation — the single home for how finely every SPHERE BODY's
 * UV mesh is subdivided (`uvSphereMesh(segments, rings)`).
 *
 * The count materialises in four renderers that must agree exactly:
 * `texturedBodyRenderer` (mapped planets and moons), `planetRenderer` (the flat
 * shaded fallback), `starRenderer` (the Sun and other stars), and
 * `bodyPickRenderer`. Before this constant existed each restated a bare 48/24
 * under a comment promising it "matches the others", which is the weakest kind of
 * agreement: nothing enforced it, and the pick renderer in particular MUST match
 * the drawn silhouette or a click near the limb resolves against a body edge that
 * is not where the pixel says it is.
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
 * by `1 − cos(half-step)` — at 48×24 both axes give a 3.75° half-step, so the
 * drawn limb falls 0.214% of the radius inside the analytic sphere. Raising the
 * counts narrows that but never closes it, and costs vertices on every body every
 * frame including the ones three pixels wide: 48×24 is 1,225 vertices, 256×128 is
 * 33,153. `uvSphereMesh` also returns `Uint16Array` indices, so
 * `(rings+1)·(segments+1) ≤ 65536` caps the practical ceiling near 256×128.
 *
 * The atmosphere shell does not pay that tax to stay aligned with this mesh: it
 * derives its ground-occlusion test radius from these counts via
 * `inscribedSphereRadiusFactor`, so the analytic ground sphere it tests against
 * tracks whatever tessellation the surface actually draws. That is the load-bearing
 * reason this constant has ONE home rather than four — a silent drift here would
 * reopen the transparent limb seam these values are chosen against.
 */

/** Longitude slices around the equator. */
export const BODY_SPHERE_SEGMENTS = 48;

/** Latitude bands from pole to pole. */
export const BODY_SPHERE_RINGS = 24;
