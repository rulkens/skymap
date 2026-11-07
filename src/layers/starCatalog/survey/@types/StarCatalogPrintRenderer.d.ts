/**
 * StarCatalogPrintRenderer — the survey stars' print twin for the antique look:
 * the frame cut's leaves as one point each in `antique-print-points`
 * (`antiqueLook/printPoint.wesl`). Shares the visual renderer's layouts,
 * records and cut lists (`StarCatalogPickResources`), like the pick twin, and
 * owns only its camera uniform.
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { StarCatalogSourceType } from '../../@types/StarCatalogSourceType';

export type StarCatalogPrintRenderer = Renderer & {
  /**
   * Record one source's leaf list into the begun print pass. `vp` is rebased about
   * the cut's origin, as the visual draw's. No-op until the source has a catalog and a cut.
   */
  draw(pass: GPURenderPassEncoder, source: StarCatalogSourceType, vp: Float32Array): void;
};
