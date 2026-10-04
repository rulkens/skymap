import type { LinkView } from './LinkView';
import type { OrientationFrameId } from '../camera/OrientationFrameId';

/**
 * LinkIntent — everything a hash says, merged across its rows. `t` is a Unix
 * instant in ms (what the URL's ISO string names); `t` and `orientation`
 * apply whatever the view is.
 */
export type LinkIntent = {
  readonly view: LinkView;
  readonly t?: number;
  readonly orientation?: OrientationFrameId;
};
