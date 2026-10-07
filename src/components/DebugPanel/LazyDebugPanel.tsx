import { lazy } from 'react';

// Split out of the entry chunk: not needed for the first paint.
const LazyDebugPanel = lazy(() => import('./DebugPanel'));

export default LazyDebugPanel;
