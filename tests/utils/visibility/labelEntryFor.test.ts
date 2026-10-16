/**
 * A panel label category that no entry lists has no switch to flip, and one two entries list
 * would read one and write the other. `selectToggleRows.test.ts` round-trips each one.
 */

import { describe, it, expect } from 'vitest';
import { labelEntryFor } from '../../../src/utils/visibility/labelEntryFor';
import { APP_VISIBILITY } from '../../../src/compositions/appVisibility';
import { LABEL_CATEGORIES } from '../../../src/data/structure/labelCategories';

describe('labelEntryFor', () => {
  it.each(LABEL_CATEGORIES)(
    'every label category resolves to exactly one label entry (%s)',
    (cat) => {
      const matches = APP_VISIBILITY.filter(
        (e) =>
          'label' in e &&
          ('items' in e ? (e.items as readonly string[]).includes(cat) : e.label === cat),
      );
      expect(matches).toHaveLength(1);
      expect(labelEntryFor(cat)).toBe(matches[0]);
    },
  );
});
