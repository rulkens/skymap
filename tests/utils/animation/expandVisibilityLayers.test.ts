/**
 * expandVisibilityLayers — expands authoring-level layer aggregates (e.g.
 * `'labels'`) into the atomic `VisibilityLayerKey`s the fade system understands,
 * passing concrete keys through untouched.
 */

import { describe, it, expect } from 'vitest';
import { expandVisibilityLayers } from '../../../src/utils/animation/expandVisibilityLayers';

describe('expandVisibilityLayers', () => {
  it('passes atomic layer keys through unchanged', () => {
    expect(expandVisibilityLayers(['flow', 'filaments'])).toEqual(['flow', 'filaments']);
  });

  it("expands 'labels' into every label layer", () => {
    expect(expandVisibilityLayers(['labels'])).toEqual([
      'surveyLabel',
      'structureLabel',
      'milkyWayLabel',
      'starCatalogLabel',
      'bodyLabel',
    ]);
  });

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
