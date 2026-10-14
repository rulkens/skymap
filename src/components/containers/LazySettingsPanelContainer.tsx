import { lazy } from 'react';

// Split out of the entry chunk: not needed for the first paint.
const LazySettingsPanelContainer = lazy(() =>
  import('../SettingsPanel/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
);

export default LazySettingsPanelContainer;
