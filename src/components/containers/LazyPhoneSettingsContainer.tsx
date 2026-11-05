import { lazy } from 'react';

// Split out of the entry chunk: not needed for the first paint.
const LazyPhoneSettingsContainer = lazy(() => import('../SettingsPanel/PhoneSettings'));

export default LazyPhoneSettingsContainer;
