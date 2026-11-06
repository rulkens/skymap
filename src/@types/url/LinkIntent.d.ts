import type { LayerSwitch } from './LayerSwitch';
import type { LinkView } from './LinkView';
import type { OrientationFrameId } from '../camera/orientation/OrientationFrameId';

/**
 * LinkIntent — everything a hash says, merged across its rows. `t` is a Unix
 * instant in ms (what the URL's ISO string names); `t`, `orientation` and
 * `layers` apply whatever the view is, `layers` in order.
 */
export type LinkIntent = {
  readonly view: LinkView;
  readonly t?: number;
  readonly orientation?: OrientationFrameId;
  readonly layers?: readonly LayerSwitch[];
};
