import type { FeatureItem } from './FeatureItem';

/**
 * A group of the Features page: `title` and one line saying what the group is for. `shot` is its picture in the
 * shot manifest and `tall` the cut of it an upright screen gets. `film` is a loop of the loop manifest, shown in a
 * disc under the group's name, with `filmSays`, the words beside the disc. A group with no picture is set quietly,
 * as a list of links.
 */
export type FeatureGroup = {
  id: string;
  title: string;
  line: string;
  shot?: string;
  tall?: string;
  film?: string;
  filmSays?: string;
  items: readonly FeatureItem[];
};
