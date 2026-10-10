import { lazy } from 'react';

// Split out of the entry chunk: not needed for the first paint.
const LazyDebugPanelContainer = lazy(() => import('./DebugPanelContainer'));

export default LazyDebugPanelContainer;
