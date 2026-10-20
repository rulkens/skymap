/**
 * `'labels'` must stand for every label the composition declares: a cue that says it hid
 * every label must not leave one captioning. Order is not a contract, so compare as sets.
 */

import { describe, it, expect } from 'vitest';
import { expandVisibilityLayers } from '../../../src/utils/animation/expandVisibilityLayers';
import { APP_VISIBILITY } from '../../../src/compositions/appVisibility';

describe('expandVisibilityLayers', () => {
  it("'labels' expands to every label address", () => {
    const labels = APP_VISIBILITY.flatMap((e) => ('label' in e ? [`label:${e.label}`] : []));
    const expanded = expandVisibilityLayers(['flow', 'labels']);
    expect(expanded[0]).toBe('flow');
    expect(new Set(expanded.slice(1))).toEqual(new Set(labels));
    expect(expanded).toHaveLength(labels.length + 1);
  });
});
