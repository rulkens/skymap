/**
 * The Layer's boot assert on its seed ids. An all-digits seed id is invisible to
 * every type and every round-trip test — `star-12` would simply deep-link to
 * survey record 12 instead of the star it names — so the only guard is this
 * throw, and the only way to exercise it is a fixture seed table.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/data/bodies/seededStarCatalogs', () => ({
  SEEDED_STAR_CATALOGS: {
    famousStar: [{ id: '12', label: 'Twelve' }],
    sun: [],
    sStar: [],
  },
}));

import { create } from '../../../src/layers/starCatalog/create';

describe('starCatalog create', () => {
  it('throws on a seed id a star- link would read as a survey index', () => {
    // The assert runs before the first device touch, so a bare stub suffices.
    expect(() => create({} as never)).toThrow('"12"');
  });
});
