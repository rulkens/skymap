import type { GalaxyFieldRenderer } from '../../@types/GalaxyFieldRenderer';
import type { IsmMapReadbacks } from './IsmMapReadbacks';

/** What only the tool uses, returned beside the host; the app ignores it. */
export type GalaxyFieldHostDebug = {
  /** Overlays, probe, ISM texture, `fieldCounts`, `hiiSegments`. */
  readonly renderer: GalaxyFieldRenderer;
  /** Orientation, ring means, the seeding view's map. */
  readonly readbacks: IsmMapReadbacks;
};
