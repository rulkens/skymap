/**
 * Body rows are DERIVED from the registry's body entries, so they can't drift
 * from the body set, and each row's `enabled` comes from that entry's
 * `visible` field — SOURCE_REGISTRY stays the single source of truth for
 * default visibility. `labelEnabled` starts true: the captions are the
 * descent's navigation aids and show until the user mutes them.
 */

import { SOURCE_ENTRIES } from '../../../../data/sourceEntries';
import type { BodyId } from '../../../../@types/data/body/BodyId';
import type { BodyItemSettings } from '../../../../@types/settings/BodyItemSettings';
import type { BodySettings } from '../../../../@types/settings/BodySettings';

export const initialState: BodySettings = {
  items: Object.fromEntries(
    SOURCE_ENTRIES.filter((e) => e.type === 'body').map((e) => [
      e.id,
      { enabled: e.visible, labelEnabled: true },
    ]),
  ) as Record<BodyId, BodyItemSettings>,
};
