/**
 * bodies — the body Layer's near-field body-gate cluster: one item row per
 * body id and the one case reducer that writes it. `liftClusterReducers`
 * re-bases that reducer onto the settings root, so its action type string
 * stays `settings/<key>`.
 */

import type { PayloadAction } from '@reduxjs/toolkit';

import { SOURCE_ENTRIES } from '../../../data/sourceEntries';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyItemSettings } from '../../../@types/settings/BodyItemSettings';
import type { BodySettings } from '../../../@types/settings/BodySettings';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';

export const bodiesSettingsFragment = {
  key: 'bodies',
  // Body rows are DERIVED from the registry's body entries, so the seed can't
  // drift from the body set, and each row's `enabled` comes from that entry's
  // `visible` field — SOURCE_REGISTRY stays the single source of truth for
  // default visibility. `labelEnabled` seeds true: the captions are the
  // descent's navigation aids and show until the user mutes them.
  seed: (): BodySettings => ({
    items: Object.fromEntries(
      SOURCE_ENTRIES.filter((e) => e.type === 'body').map((e) => [
        e.id,
        { enabled: e.visible, labelEnabled: true },
      ]),
    ) as Record<BodyId, BodyItemSettings>,
  }),
  reducers: {
    // The caption axis is the only WRITABLE one: `bodies.items[id].enabled` is
    // seeded from the registry row and read by `visibleStars` (the Sun's dot)
    // and `foregroundLabelsPass` (the Sun's caption), but no product decision
    // has been made to expose a "hide this body" control, so no setter exists
    // to turn it into a knob nothing turns. There is no cluster-level gate
    // either, for the same reason (see EngineSettingsState).
    setBodyLabelEnabled: (
      cluster: BodySettings,
      action: PayloadAction<{ id: BodyId; enabled: boolean }>,
    ) => {
      cluster.items[action.payload.id].labelEnabled = action.payload.enabled;
    },
  },
} as const satisfies LayerSettingsFragment<'bodies', BodySettings>;
