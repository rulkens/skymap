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
 * The atmosphere shell fragment (`shell/fragment.wesl`) tests its ray against the
 * EXACT analytic ground radius, with no tessellation compensation — it does not
 * read these counts at all. So the drawn surface (a polygon inscribed 0.214%
 * inside that radius) and the ground-occlusion test (the true sphere) disagree,
 * and along the limb a ray can pass the surface's silhouette while still failing
 * the ground test, or the reverse. That mismatch is the known transparent limb
 * seam tracked in `docs/backlog/2026-07-24-atmosphere-limb-transparent-seam.md`;
 * it is an open, understood gap, not something this file compensates for.
 *
 * What this file's single-home status actually buys is `bodyPickRenderer`
 * staying exact: its pick silhouette is built from these same counts, so it can
 * never drift from the drawn silhouette. If it did, a click near a body's limb
 * would resolve against an edge that is not where the pixel is — a real
 * misclick a comment cannot prevent, only a shared constant can.
 */

/** Longitude slices around the equator. */
export const BODY_SPHERE_SEGMENTS = 48;

/** Latitude bands from pole to pole. */
export const BODY_SPHERE_RINGS = 24;
