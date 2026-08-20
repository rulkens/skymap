/**
 * diskRadiusRingLayer — developer overlay that rings the SELECTED galaxy
 * at its catalog procedural-disk radius, lying in the disk plane.
 *
 * Lives among the swap-target layers (the `blend: 'over'` group within
 * `CONTENT_LAYERS`, drawn post-tone-map) like the selection ring: it is
 * screen overlay, not emissive scene content. Gated on
 * `state.settings.debug.overlays['disk-radius-ring']` plus a galaxy
 * selection, so a default-off build pays one boolean per frame.
 *
 * ## What it's for
 *
 * A calibration aid for famous-galaxy thumbnails: the ring marks the
 * catalog disk radius (`paddedRadiusMpc(diameterKpc)` — the same world
 * half-extent the textured quad derives its size from), so the curator
 * can check by eye whether the calibrated disk's visible edge lands on
 * it. The ring is drawn in the SAME plane the textured disk renders in
 * (via `effectiveTilt` for calibrated rows, catalog orientation
 * otherwise), so "does the disk fill the ring?" is an apples-to-apples
 * comparison rather than two unrelated ellipses.
 *
 * ## Why radius is the catalog value, not the calibrated quad size
 *
 * Calibration scales the rendered QUAD (`1 / diskRadiusFrac`) so the
 * galaxy's disk-within-the-frame spans the catalog size. The ring is the
 * fixed reference the disk is being calibrated against, so it stays at
 * the unscaled `paddedRadiusMpc(diameterKpc)`.
 */

import { Source } from '../../../../data/sources';
import { paddedRadiusMpc } from '../../../../utils/paddedRadiusMpc';
import { effectiveTilt } from '../../../../utils/render/disk/effectiveTilt';
import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { COSMO } from '../slabs';

export const diskRadiusRingLayer: ContentLayer = {
  name: 'disk-radius-ring',
  slab: COSMO,
  target: 'swap',
  blend: 'over',

  enabled(state, _ctx) {
    // Handle check first: no ring renderer means nothing to draw, and
    // short-circuiting here keeps the gate robust against the not-yet-
    // constructed startup window (and partial test stubs) without
    // reaching for `state.settings`.
    if (!state.gpu.diskRadiusRing) return false;
    if (!state.settings.debug.overlays['disk-radius-ring']) return false;
    const sel = state.selection.select;
    return sel !== null && sel.type === 'galaxyCatalog';
  },

  draw(pass, view, _ctx, state) {
    const sel = state.selection.select;
    // `enabled()` proved a galaxy ref — narrow accordingly.
    if (sel === null || sel.type !== 'galaxyCatalog') return;
    // This debug layer still re-indexes the catalog: it needs the tilt /
    // calibration fields (axisRatio, positionAngleDeg, famous calibration)
    // that aren't carried on GalaxyInfo, only `sel.source` + `sel.index`.
    const catalog = state.data.galaxies.catalogs.get(sel.source);
    // Defensive: a tier swap can evict the catalog between `enabled()`
    // and `draw()`; a no-op is correct (next frame's gate re-reads it).
    if (!catalog) return;

    const i = sel.index;
    const center: Vec3 = [
      catalog.positions[i * 3 + 0]!,
      catalog.positions[i * 3 + 1]!,
      catalog.positions[i * 3 + 2]!,
    ];
    // The catalog disk RADIUS (= the textured quad's halfSize), the fixed
    // reference the calibrated disk is checked against.
    const radiusWorld = paddedRadiusMpc(catalog.diameterKpc[i]!);
    const catalogAxisRatio = catalog.axisRatio[i]!;

    // Tilt the ring into the SAME plane the textured disk renders in: the
    // calibration's effective tilt when present (deprojected → catalog PA +
    // axisRatio; as-shot → flat), else the catalog orientation. The
    // deprojected and uncalibrated branches both resolve to the catalog
    // plane, so the ring matches the disk for every famous galaxy.
    const cal =
      sel.source === Source.FamousGalaxy ? state.famousGalaxiesMeta[i]?.calibration : undefined;
    const catalogPaDeg = catalog.positionAngleDeg[i]!;
    const tilt = cal
      ? effectiveTilt(cal, catalogAxisRatio, catalogPaDeg)
      : { axisRatio: catalogAxisRatio, positionAngleDeg: catalogPaDeg };

    state.gpu.diskRadiusRing!.draw(pass, view.vp, {
      center,
      radiusWorld,
      axisRatioForTilt: tilt.axisRatio,
      paDeg: tilt.positionAngleDeg,
    });
  },
};
