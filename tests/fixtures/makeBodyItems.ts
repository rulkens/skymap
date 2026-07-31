/**
 * makeBodyItems — `settings.bodies.items` for engine fixtures, keyed off
 * `BODY_IDS` (the same registry list `buildInitialSettings` seeds from).
 *
 * A row a hand-listed fixture omits does NOT fail an assertion: the gates read
 * `items[id].enabled` unguarded, so the suite dies with a `TypeError` the next
 * time a body is registered — which is how one new body has repeatedly broken
 * several unrelated star/caption suites at once. Deriving the keys is the fix,
 * and it lives here so there is one spelling rather than a copy per suite.
 *
 * `of` returns the per-row deviations from an all-on baseline; suites that vary
 * a single bit flip it off that baseline.
 */

import { BODY_IDS } from '../../src/data/bodies/bodyIds';

import type { BodyItemSettings } from '../../src/@types/settings/BodyItemSettings';

export function makeBodyItems(
  of: (bodyId: string) => Partial<BodyItemSettings> = () => ({}),
): Record<string, BodyItemSettings> {
  return Object.fromEntries(
    BODY_IDS.map((id) => [id, { enabled: true, labelEnabled: true, ...of(id) }]),
  );
}
