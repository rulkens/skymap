/**
 * BodySettings — near-field body gates, the FIFTH source-type cluster.
 * No cluster-level `enabled`: unlike the four data clusters, the bodies ARE
 * the destination of the descent and a master gate over them would have no
 * caller. Should one arrive it must be TOTAL over the rows, like
 * `starCatalogs.enabled` / `volumes.enabled`.
 */

import type { BodyId } from '../data/body/BodyId';
import type { BodyItemSettings } from './BodyItemSettings';

export type BodySettings = {
  /**
   * One row per `BodyId` (earth, planet, sun): the visibility axis
   * (`enabled`) and the caption axis (`labelEnabled`). `enabled` is
   * genuinely live for the Sun — `visibleStars` gates its dot on
   * `items.sun.enabled`, and the foreground-caption layer gates the Sun's
   * caption on the same flag — but the axis is otherwise unwritten: no
   * setter exists, and Earth's / the planet's `enabled` have no reader
   * today. The axis exists on every row regardless, so the cluster keeps
   * ONE per-item shape rather than the Sun alone carrying an extra field.
   */
  items: Record<BodyId, BodyItemSettings>;
};
