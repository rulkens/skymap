/**
 * exoplanetOrbitsPass — draws the close-approach orbit diagrams of the
 * exoplanet-system anchors: the orbital plane first, then the host and planet
 * dots through their own marker renderer, so the structure rings' pick
 * instances stay untouched. Nothing here is pickable.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { StructureRuntime } from '../@types/StructureRuntime';
import { produceExoplanetOrbitDiagram } from '../present/produceExoplanetOrbitDiagram';

export function exoplanetOrbitsPass(runtime: StructureRuntime): ContentPass<'structureRing'> {
  return {
    name: 'exoplanet-orbits',
    fade: 'structureRing',
    enabled: (_state, _ctx, _view, fade) => fade['exoplanet-system'] !== 0,
    draw(pass, view, ctx, _state, fade) {
      const { markers, plane } = produceExoplanetOrbitDiagram(
        runtime.store,
        ctx,
        fade['exoplanet-system'],
      );
      if (plane !== null) runtime.orbitPlaneRenderer.draw(pass, ctx.cam, view.viewportPx, plane);
      runtime.orbitRenderer.setMarkers(markers, view.camPos);
      if (markers.length === 0) return;
      runtime.orbitRenderer.draw(pass, view.slab.vp, view.viewportPx, ctx.drawPxPerRad);
    },
  };
}
