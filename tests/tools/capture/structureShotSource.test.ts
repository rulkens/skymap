import { describe, expect, it } from 'vitest';
import { structureShotSource } from '../../../tools/capture/structureShotSource';
import { buildStaticAnchorStructures } from '../../../src/layers/structure/load/buildStaticAnchorStructures';

const byId = (id: string) => buildStaticAnchorStructures().find((s) => s.id === id)!;

describe('structureShotSource', () => {
  it('renders what fills too much sky, cuts out compact clusters, groups and Milky Way structures', () => {
    expect(structureShotSource(byId('galaxy-group-local-group'))).toBe('render');
    expect(structureShotSource(byId('galaxy-cluster-virgo-m87'))).toBe('render');
    expect(structureShotSource(byId('galaxy-group-m81-group'))).toBe('render');
    expect(structureShotSource(byId('galaxy-cluster-coma-a1656'))).toBe('cutout');
    expect(structureShotSource(byId('galaxy-group-leo-triplet'))).toBe('cutout');
    expect(structureShotSource(byId('nebula-orion'))).toBe('cutout');
  });

  it('keeps superclusters and voids as app renders', () => {
    expect(structureShotSource(byId('supercluster-laniakea-sc'))).toBe('render');
    expect(structureShotSource(byId('void-bootes-void'))).toBe('render');
  });
});
