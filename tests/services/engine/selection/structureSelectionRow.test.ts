import { describe, expect, it } from 'vitest';
import { structureSelectionRow } from '../../../../src/services/engine/selection/structureSelectionRow';

const row = structureSelectionRow(() => ({
  structures: { byId: () => null, byCategory: () => [] },
}));
const claims = (id: string) => row.focusId!.claims(id);

describe('structureSelectionRow focus claims', () => {
  it('open-cluster and globular-cluster ids resolve to their own category', () => {
    expect(claims('open-cluster-pleiades')).toBe(true);
    expect(claims('globular-cluster-m13')).toBe(true);
  });

  it('claims a Galactic Centre place by its suffixed id and not the bare place id', () => {
    expect(claims('galactic-centre')).toBe(false);
    expect(claims('galactic-centre-arches')).toBe(true);
  });
});
