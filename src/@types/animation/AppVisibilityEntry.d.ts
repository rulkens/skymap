import type { APP_VISIBILITY } from '../../compositions/appVisibility';

/** One composed visibility entry, literal-typed: every address type derives from this union. */
export type AppVisibilityEntry = (typeof APP_VISIBILITY)[number];
