import { describe, it, expect } from 'vitest';
import { Source } from '../../src/data/source';
import { APP_SOURCE_REGISTRY } from '../../src/compositions/appSources';

describe('Source.FamousGalaxy', () => {
  it('has integer value 4 (next free slot after Glade=3)', () => {
    expect(Source.FamousGalaxy).toBe(4);
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
  it('appends Cluster=5, Supercluster=6, Void=7 to the enum', () => {
    expect(Source.GalaxyCluster).toBe(5);
    expect(Source.Supercluster).toBe(6);
    expect(Source.Void).toBe(7);
  });
});
