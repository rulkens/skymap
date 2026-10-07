import { lazy } from 'react';

// Split out of the entry chunk: not needed for the first paint.
const LazySettingsPanelContainer = lazy(() => import('./SettingsPanelContainer'));

export default LazySettingsPanelContainer;
