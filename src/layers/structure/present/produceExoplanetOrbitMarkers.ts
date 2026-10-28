/**
 * produceExoplanetOrbitMarkers — the close-approach orbit diagram of each
 * exoplanet-system anchor: a ring per known orbit, the habitable zone's two
 * edges, and each planet as a dot at its phase on the sim clock.
 *
 * Face-on to the camera, always: for most systems only the orbit's tilt to our
 * line of sight is known, not its orientation in space, so the rings are a
 * diagram of sizes and timing, not a claim about the orbital plane. The
 * diagram fades in once the outermost ring spans FADE_IN_PX on screen.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { ImagePlaneBasis } from '../../../@types/camera/ImagePlaneBasis';
import type { StructureStore } from '../@types/StructureStore';
import type { StructureMarkerDescriptor } from '../@types/StructureMarkerDescriptor';
import { EXOPLANET_ORBITS } from '../data/exoplanetOrbits';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { MARKER_RADIUS_RETUNE } from '../../../data/markerRadiusRetune';
import { smoothstep } from '../../../utils/math/smoothstep';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/frameUp';
import { orbitForwardOf } from '../../../utils/camera/orbitForwardOf';

const AU = SCALE_UNITS.AU_TO_MPC;
// The marker shader draws a ring at radiusMpc x MARKER_RADIUS_RETUNE; dividing
// it out puts each ring at the true semi-major axis, where its planet dot sits.
const DRAWN = 1 / MARKER_RADIUS_RETUNE;
const FADE_IN_PX: readonly [number, number] = [12, 40];
const DOT_RADIUS_PX = 6;
const ORBIT_RGBA: readonly [number, number, number, number] = [0.8, 0.85, 1.0, 0.45];
const ZONE_RGBA: readonly [number, number, number, number] = [0.3, 0.95, 0.55, 0.6];
const PLANET_RGBA: readonly [number, number, number, number] = [1.0, 0.95, 0.85, 1.0];
const HOST_RGBA: readonly [number, number, number, number] = [1.0, 0.6, 0.3, 1.0];

const fwd: Vec3 = [0, 0, 0];
const upRef: Vec3 = [0, 0, 0];
const basis: ImagePlaneBasis = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };

export function produceExoplanetOrbitMarkers(
  store: Pick<StructureStore, 'byId'>,
  view: FrameView,
  fade: number,
): readonly StructureMarkerDescriptor[] {
  if (fade === 0) return [];
  const out: StructureMarkerDescriptor[] = [];
  const [cx, cy, cz] = view.drawCamPos;
  orbitForwardOf(view.cam, fwd);
  imagePlaneBasis(fwd, view.cam.roll ?? 0, frameUp(view.cam.upBasis, upRef), basis);
  const { right, up } = basis;
  const simDays = view.snapshot.simDays;

  for (const [id, system] of Object.entries(EXOPLANET_ORBITS)) {
    const host = store.byId(id);
    if (host === null) continue;
    const [hx, hy, hz] = host.worldPos;
    const distanceMpc = Math.hypot(hx - cx, hy - cy, hz - cz);
    const outerAu = Math.max(
      ...system.planets.map((p) => p.semiMajorAxisAu),
      system.habitableZoneAu?.[1] ?? 0,
    );
    const outerPx = ((outerAu * AU) / distanceMpc) * view.drawPxPerRad;
    const alpha = fade * smoothstep(FADE_IN_PX[0], FADE_IN_PX[1], outerPx);
    if (alpha === 0) continue;

    const ring = (key: string, radiusAu: number, rgba: readonly number[]): void => {
      out.push({
        id: `${id}-${key}`,
        category: 'exoplanet-system',
        worldPos: [hx, hy, hz],
        radiusMpc: radiusAu * AU * DRAWN,
        haloColor: [0, 0, 0, 0],
        ringColor: [rgba[0]!, rgba[1]!, rgba[2]!, rgba[3]! * alpha],
        pickable: false,
      });
    };
    if (system.habitableZoneAu !== null) {
      ring('hz-inner', system.habitableZoneAu[0], ZONE_RGBA);
      ring('hz-outer', system.habitableZoneAu[1], ZONE_RGBA);
    }
    const dotMpc = ((DOT_RADIUS_PX * distanceMpc) / view.drawPxPerRad) * DRAWN;
    // The host itself: most planet hosts are too faint to see at this range.
    out.push({
      id: `${id}-host`,
      category: 'exoplanet-system',
      worldPos: [hx, hy, hz],
      radiusMpc: dotMpc * 1.5,
      haloColor: [HOST_RGBA[0], HOST_RGBA[1], HOST_RGBA[2], alpha],
      ringColor: [HOST_RGBA[0], HOST_RGBA[1], HOST_RGBA[2], alpha],
      pickable: false,
    });
    for (const planet of system.planets) {
      ring(planet.name, planet.semiMajorAxisAu, ORBIT_RGBA);
      // A transit midpoint fixes the phase; without one the angle is arbitrary but still moves.
      const turns = (simDays - (planet.transitJd ?? 0)) / planet.periodDays;
      const angle = 2 * Math.PI * (turns - Math.floor(turns));
      const r = planet.semiMajorAxisAu * AU;
      const c = Math.cos(angle) * r;
      const s = Math.sin(angle) * r;
      out.push({
        id: `${id}-${planet.name}-dot`,
        category: 'exoplanet-system',
        worldPos: [
          hx + c * right[0] + s * up[0],
          hy + c * right[1] + s * up[1],
          hz + c * right[2] + s * up[2],
        ],
        radiusMpc: dotMpc,
        haloColor: [PLANET_RGBA[0], PLANET_RGBA[1], PLANET_RGBA[2], alpha],
        ringColor: [PLANET_RGBA[0], PLANET_RGBA[1], PLANET_RGBA[2], alpha],
        pickable: false,
      });
    }
  }
  return out;
}
