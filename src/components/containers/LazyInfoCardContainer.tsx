import { lazy } from 'react';

// Split out of the entry chunk: not needed for the first paint.
const LazyInfoCardContainer = lazy(() => import('./InfoCardContainer'));

export default LazyInfoCardContainer;
