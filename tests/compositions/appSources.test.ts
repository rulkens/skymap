import { describe, it, expect } from 'vitest';
import { Source } from '../../src/data/source';
import { APP_SOURCE_REGISTRY } from '../../src/compositions/appSources';

describe('Source.FamousGalaxy', () => {
  it('is the famous galaxy entry’s id', () => {
    expect(Source.FamousGalaxy).toBe('famousGalaxy');
  });
});

describe('APP_SOURCE_REGISTRY ids', () => {
  const ids = Object.values(APP_SOURCE_REGISTRY).map((e) => e.id);

  it('ids are unique across the registry', () => {
    // The id is the single home for each source's readable key — domain
    // types (StructureId, visibility records, volume handles) derive
    // from it, so a collision would silently merge two sources downstream.
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Source enum — structure codes (cluster/supercluster/void)', () => {
  it('names the structure sources by their ids', () => {
    expect(Source.GalaxyCluster).toBe('galaxy-cluster');
    expect(Source.Supercluster).toBe('supercluster');
    expect(Source.Void).toBe('void');
  });
});
