/**
 * produceExoplanetOrbitDiagram — the close-approach orbit diagram of each
 * exoplanet-system anchor: the host and each planet as dots for the marker
 * renderer, and the orbits and habitable zone as one plane for the orbit-plane
 * renderer. Planets sit in that plane at their phase on the sim clock.
 *
 * The diagram fades in once the system spans FADE_IN_PX on screen. Only the
 * most visible system gets a plane: hosts are parsecs apart, so two never
 * share a close-up.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { StructureStore } from '../@types/StructureStore';
import type { StructureMarkerDescriptor } from '../@types/StructureMarkerDescriptor';
import type { ExoplanetOrbitDiagram } from '../@types/ExoplanetOrbitDiagram';
import type { ExoplanetOrbitPlane } from '../@types/ExoplanetOrbitPlane';
import { EXOPLANET_ORBITS } from '../data/exoplanetOrbits';
import { exoplanetSystemExtentAu } from './exoplanetSystemExtentAu';
import { exoplanetOrbitPlaneBasis } from './exoplanetOrbitPlaneBasis';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { MARKER_RADIUS_RETUNE } from '../../../data/markerRadiusRetune';
import { smoothstep } from '../../../utils/math/smoothstep';

const AU = SCALE_UNITS.AU_TO_MPC;
const FADE_IN_PX: readonly [number, number] = [12, 40];
const DOT_RADIUS_PX = 6;
const PLANET_RGBA: readonly [number, number, number, number] = [1.0, 0.95, 0.85, 1.0];
const HOST_RGBA: readonly [number, number, number, number] = [1.0, 0.6, 0.3, 1.0];

function dot(
  id: string,
  worldPos: readonly [number, number, number],
  radiusMpc: number,
  rgba: readonly number[],
  alpha: number,
): StructureMarkerDescriptor {
  const color: [number, number, number, number] = [rgba[0]!, rgba[1]!, rgba[2]!, alpha];
  return {
    id,
    category: 'exoplanet-system',
    worldPos: [worldPos[0], worldPos[1], worldPos[2]],
    radiusMpc,
    haloColor: color,
    ringColor: color,
    pickable: false,
  };
}

export function produceExoplanetOrbitDiagram(
  store: Pick<StructureStore, 'byId'>,
  view: FrameView,
  fade: number,
): ExoplanetOrbitDiagram {
  const markers: StructureMarkerDescriptor[] = [];
  let plane: ExoplanetOrbitPlane | null = null;
  if (fade === 0) return { markers, plane };
  const [cx, cy, cz] = view.drawCamPos;
  const simDays = view.snapshot.simDays;

  for (const [id, system] of Object.entries(EXOPLANET_ORBITS)) {
    const host = store.byId(id);
    if (host === null) continue;
    const [hx, hy, hz] = host.worldPos;
    const distanceMpc = Math.hypot(hx - cx, hy - cy, hz - cz);
    const extentPx = ((exoplanetSystemExtentAu(system) * AU) / distanceMpc) * view.drawPxPerRad;
    const alpha = fade * smoothstep(FADE_IN_PX[0], FADE_IN_PX[1], extentPx);
    if (alpha === 0) continue;

    const { u, v } = exoplanetOrbitPlaneBasis(host.worldPos, system.inclinationDeg);
    if (plane === null || alpha > plane.alpha) {
      plane = {
        u,
        v,
        hostRelEyeAu: [(hx - cx) / AU, (hy - cy) / AU, (hz - cz) / AU],
        orbitsAu: system.planets.map((p) => p.semiMajorAxisAu),
        habitableZoneAu: system.habitableZoneAu,
        alpha,
      };
    }
    // The marker shader draws a dot at radiusMpc x MARKER_RADIUS_RETUNE.
    const dotMpc = (DOT_RADIUS_PX * distanceMpc) / view.drawPxPerRad / MARKER_RADIUS_RETUNE;
    // The host itself: most planet hosts are too faint to see at this range.
    markers.push(dot(`${id}-host`, host.worldPos, dotMpc * 1.5, HOST_RGBA, alpha));
    for (const planet of system.planets) {
      // A transit midpoint is when the planet crosses in front of its host (+u);
      // without one the angle is arbitrary but still moves.
      const turns = (simDays - (planet.transitJd ?? 0)) / planet.periodDays;
      const angle = 2 * Math.PI * (turns - Math.floor(turns));
      const c = Math.cos(angle) * planet.semiMajorAxisAu * AU;
      const s = Math.sin(angle) * planet.semiMajorAxisAu * AU;
      const pos = [0, 1, 2].map((k) => host.worldPos[k]! + c * u[k]! + s * v[k]!);
      markers.push(
        dot(`${id}-${planet.name}`, [pos[0]!, pos[1]!, pos[2]!], dotMpc, PLANET_RGBA, alpha),
      );
    }
  }
  return { markers, plane };
}
