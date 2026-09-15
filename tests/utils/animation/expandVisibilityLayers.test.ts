/**
 * expandVisibilityLayers — expands authoring-level layer aggregates (e.g.
 * `'labels'`) into the atomic `VisibilityLayerKey`s the fade system understands,
 * passing concrete keys through untouched.
 */

import { describe, it, expect } from 'vitest';
import { expandVisibilityLayers } from '../../../src/utils/animation/expandVisibilityLayers';

describe('expandVisibilityLayers', () => {
  it('expands aggregates inline, preserving order and mixing with atomic keys', () => {
    expect(expandVisibilityLayers(['volumesMaster', 'labels', 'flow'])).toEqual([
      'volumesMaster',
      'surveyLabel',
      'structureLabel',
      'milkyWayLabel',
      'starCatalogLabel',
      'bodyLabel',
      'flow',
    ]);
  });
});
