import type { APP_VISIBILITY_REGISTRY } from '../../compositions/appVisibility';

/** One composed visibility entry, literal-typed: every address type derives from this union. */
export type AppVisibilityEntry = (typeof APP_VISIBILITY_REGISTRY)[number];
