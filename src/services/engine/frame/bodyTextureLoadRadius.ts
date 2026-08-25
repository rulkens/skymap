/**
 * bodyTextureLoadRadius — the per-body camera distance (Mpc) at which a body's
 * surface texture is demanded, derived from that body's seeded `radiusM`.
 *
 * ### Why per-body, derived from the seed
 *
 * The two-way demand rail (`assetWiring`'s `bodyTextureRow`) needs a "start
 * loading" distance per texture. A single shared distance cannot serve a family
 * of bodies that span four decades of physical size: Jupiter (~71 000 km) is a
 * visible disk from vastly farther out than a Galilean moon (~1 500 km). Scaling
 * the gate off the body's own `SCENE_BODIES` radius means a moved, resized, or
 * newly added body carries its own load radius automatically — the same
 * single-source-of-truth rule `sceneOrbits.ts` and `FOREGROUND_MAX_DISTANCE_MPC`
 * observe, applied per body.
 *
 * ### The trade the multiplier balances
 *
 * `LOAD_RADIUS_BODY_RADII` counts body radii: the demand gate sits that many of
 * the body's own radii out from its centre. It balances two opposing pressures.
 *
 *   - **Selectivity (keep it tight).** The per-body proximity design exists so
 *     that only the body being approached holds a resident texture. At the large
 *     tier each surface is ~135 MB of GPU memory; a gate wide enough to fire
 *     every body at once on solar-system entry would pin the whole 14-texture
 *     set resident and blow the memory budget the tiered scheme is meant to
 *     protect. The gate must therefore be *selective between neighbouring
 *     planets* — approaching Earth must not drag in Mars.
 *   - **Fetch lead time (don't make it too tight).** An 8 k surface JPG is
 *     megabytes over a slow link, so demanding it only at the surface would show
 *     an untextured body on arrival. It need not be fully resident, though: the
 *     renderer draws a flat-albedo sphere until the texture commits, so a
 *     late-arriving fetch just pops in — the same pop-in posture as the galaxy
 *     thumbnails. Lead time is a nicety, not a correctness constraint, so it
 *     loses to selectivity when the two conflict.
 *
 * At the chosen value Earth's gate lands near ~0.4 AU — selective against the
 * neighbouring planets, yet still ~4 orders of magnitude beyond the ~50 px
 * range where surface detail first reads. The const is the single tuning knob.
 * Because the gate scales with radius, gas giants are proportionally greedier
 * (a wider gate for a bigger body), which is acceptable: the outer system is
 * sparse, so a giant's wide gate rarely overlaps a neighbour.
 *
 * The ring (`'saturn-ring'`) has no body of its own — it rides Saturn's disk —
 * so its load radius is Saturn's. Resolving the host via the shared `hostBodyId`
 * (derived from `SCENE_RINGS`) lets the wiring row call this with the same key
 * space it uses for the slot family, rather than special-casing the ring at the
 * call site.
 */

import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../../@types/data/RingTextureId';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';
import { hostBodyId } from '../../../utils/scene/hostBodyId';
import { SCALE_UNITS } from '../../../data/scaleUnits';

// How many of the body's own radii out from its centre the texture demand
// fires. Sized for selectivity between neighbouring planets — see the module
// header's trade-off rationale.
const LOAD_RADIUS_BODY_RADII = 1e4;

export function loadRadiusMpc(id: BodyTextureId | RingTextureId): number {
  const body = findByIdOrThrow(SCENE_BODIES, hostBodyId(id), 'bodyTextureLoadRadius');
  return body.radiusM * SCALE_UNITS.M_TO_MPC * LOAD_RADIUS_BODY_RADII;
}
