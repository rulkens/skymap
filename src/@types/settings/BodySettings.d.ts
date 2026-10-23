/**
 * BodySettings — near-field body gates, one `items` row per `BodySourceId`. `enabled`
 * is live only for the Sun; Earth's and the planets' have no reader and no
 * setter, and the axis exists on every row so the cluster keeps ONE per-item
 * shape. No cluster master gate; one added later must be TOTAL over the rows.
 */

import type { BodySourceId } from '../data/body/BodySourceId';
import type { BodyItemSettings } from './BodyItemSettings';

export type BodySettings = {
  items: Record<BodySourceId, BodyItemSettings>;
};
