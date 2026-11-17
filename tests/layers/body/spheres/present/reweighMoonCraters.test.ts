import { describe, it, expect } from 'vitest';
import { moonCraterTable } from '../../../../../src/layers/body/spheres/present/moonCraterTable';
import { reweighMoonCraters } from '../../../../../src/layers/body/spheres/present/reweighMoonCraters';

describe('reweighMoonCraters', () => {
  it("puts a named crater's curated weight over the bake's and leaves the bake's table alone", () => {
    const baked = moonCraterTable([0, 0, 50, 1, 10, 0, 50, 1, 20, 0, 50, 1], 1737.4);
    const named = [
      { id: 'moonPlace-ruined', index: 0, revealPx: 1 },
      { id: 'moonPlace-uncurated', index: 1, revealPx: 1 },
    ];
    const table = reweighMoonCraters(baked, named, { 'moonPlace-ruined': 0.4 });
    expect([...table.weight]).toEqual([expect.closeTo(0.4), 1, 1]);
    expect(baked.weight[0]).toBe(1);
  });
});
