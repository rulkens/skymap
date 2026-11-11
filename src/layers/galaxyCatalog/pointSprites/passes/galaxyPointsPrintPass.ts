/**
 * galaxyPointsPrintPass — every loaded galaxy as a point in the antique look's
 * `antique-print-points` row, which the glyph pass prints as a dot. Listed in
 * `ANTIQUE_ONLY_PASSES`, so it never draws with the look off.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { GalaxyCatalogRuntime } from '../../@types/GalaxyCatalogRuntime';
import { printUniformBytesOf } from '../render/printUniformBytesOf';
import { PRINT_MIN_FADE } from '../data/printMinFade';

export function galaxyPointsPrintPass(runtime: GalaxyCatalogRuntime): ContentPass<'survey'> {
  return {
    name: 'galaxy-points-print',
    fade: 'survey',

    enabled: () => true,

    draw(pass, view, ctx, state, fade) {
      const sources = Array.from(runtime.pointRenderer.loadedSources()).filter(
        (s) => fade[s.source] >= PRINT_MIN_FADE,
      );
      runtime.pointPrintRenderer.draw(pass, sources, printUniformBytesOf(view, ctx, state));
    },
  };
}
