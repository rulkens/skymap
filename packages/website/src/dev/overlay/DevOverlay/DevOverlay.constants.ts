import { lazy } from 'react';

export const OverlayTools = import.meta.env.DEV
  ? lazy(() => import('../OverlayTools/OverlayTools.tsx'))
  : null;
