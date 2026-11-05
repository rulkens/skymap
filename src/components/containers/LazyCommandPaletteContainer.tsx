import { lazy } from 'react';

// Split out of the entry chunk: not needed for the first paint.
const LazyCommandPaletteContainer = lazy(() => import('./CommandPaletteContainer'));

export default LazyCommandPaletteContainer;
