/**
 * diskRadiusRingPass — developer overlay that rings the SELECTED galaxy at its
 * catalog procedural-disk radius, lying in the disk plane. Drawn post-tone-map
 * among the swap-target layers, so it hands the ring the swap row's CURRENT
 * format and the renderer re-keys its pipeline on a change (D9) — core's
 * swap-format rebuild walk no longer owns this handle.
 *
 * Radius is the CATALOG value, not the calibrated quad size: calibration scales
 * the rendered quad, and the ring is the fixed reference it is checked against.
 */

import { Source } from '../../../data/sources';
import { paddedRadiusMpc } from '../../../utils/paddedRadiusMpc';
import { effectiveTilt } from '../../../utils/render/disk/effectiveTilt';
import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { GalaxyCatalogRuntime } from '../types/GalaxyCatalogRuntime';

export function diskRadiusRingPass(runtime: GalaxyCatalogRuntime): ContentPass {
  return {
    name: 'disk-radius-ring',

    enabled(state) {
      if (!state.settings.debug.overlays['disk-radius-ring']) return false;
      const sel = state.selection.select;
      return sel !== null && sel.type === 'galaxyCatalog';
    },

    draw(pass, view, ctx, state) {
      const sel = state.selection.select;
      // `enabled()` proved a galaxy ref — narrow accordingly.
      if (sel === null || sel.type !== 'galaxyCatalog') return;
      // This debug layer still re-indexes the catalog: it needs the tilt /
      // calibration fields (axisRatio, positionAngleDeg, famous calibration)
      // that aren't carried on GalaxyInfo, only `sel.source` + `sel.index`.
      const catalog = runtime.catalogs.get(sel.source);
      // Defensive: a tier swap can evict the catalog between `enabled()`
      // and `draw()`; a no-op is correct (next frame's gate re-reads it).
      if (!catalog) return;

      const i = sel.index;
      const center: Vec3 = [
        catalog.positions[i * 3 + 0]!,
        catalog.positions[i * 3 + 1]!,
        catalog.positions[i * 3 + 2]!,
      ];
      const radiusWorld = paddedRadiusMpc(catalog.diameterKpc[i]!);
      const catalogAxisRatio = catalog.axisRatio[i]!;

      // Tilt the ring into the SAME plane the textured disk renders in: the
      // calibration's effective tilt when present (deprojected → catalog PA +
      // axisRatio; as-shot → flat), else the catalog orientation.
      const cal =
        sel.source === Source.FamousGalaxy ? runtime.famousMeta[i]?.calibration : undefined;
      const catalogPaDeg = catalog.positionAngleDeg[i]!;
      const tilt = cal
        ? effectiveTilt(cal, catalogAxisRatio, catalogPaDeg)
        : { axisRatio: catalogAxisRatio, positionAngleDeg: catalogPaDeg };

      runtime.diskRadiusRing.draw(pass, view.vp, ctx.renderTargets.specOf('swap').format, {
        center,
        radiusWorld,
        axisRatioForTilt: tilt.axisRatio,
        paDeg: tilt.positionAngleDeg,
      });
    },
  };
}
