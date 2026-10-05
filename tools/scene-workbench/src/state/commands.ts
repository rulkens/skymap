import { createAction } from '@reduxjs/toolkit';

import type { BoundsM } from '../../@types/BoundsM';

/** Trips the viewport's dirty flag, and is the one route by which the splat
 *  facts the panel needs — the asset's extent, and how many splats survived
 *  the clip box — leave `RenderResources` for the store. */
export const splatOrderWritten = createAction<{
  assetId: string;
  drawCount: number;
  splatCount: number;
  boundsM: BoundsM;
}>('splatOrderWritten');

/** Saga-only draw-mode commands (`watchOutlineSaga`); no reducer handles them. */
export const drawOutlineRequested = createAction<string>('drawOutlineRequested'); // assetId
export const outlineSaveRequested = createAction('outlineSaveRequested');
export const outlineDiscardRequested = createAction('outlineDiscardRequested');
