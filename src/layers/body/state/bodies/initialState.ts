/**
 * Body rows are DERIVED from the registry's body entries, so they can't drift
 * from the body set; every row boots `enabled: true` — no body ships hidden
 * today. `labelEnabled` starts true too: the captions are the descent's
 * navigation aids and show until the user mutes them.
 */

import { SOURCE_ENTRIES } from '../../../../data/sourceEntries';
import type { BodyId } from '../../../../@types/data/body/BodyId';
import type { BodyItemSettings } from '../../../../@types/settings/BodyItemSettings';
import type { BodySettings } from '../../../../@types/settings/BodySettings';

export const initialState: BodySettings = {
  items: Object.fromEntries(
    SOURCE_ENTRIES.filter((e) => e.type === 'body').map((e) => [
      e.id,
      { enabled: true, labelEnabled: true },
    ]),
  ) as Record<BodyId, BodyItemSettings>,
};
