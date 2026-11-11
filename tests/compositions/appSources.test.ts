import { describe, it, expect } from 'vitest';
import { APP_SOURCE_REGISTRY } from '../../src/compositions/appSources';

describe('APP_SOURCE_REGISTRY ids', () => {
  const ids = Object.values(APP_SOURCE_REGISTRY).map((e) => e.id);

  it('ids are unique across the registry', () => {
    // The id is the single home for each source's readable key — domain
    // types (StructureId, visibility records, volume handles) derive
    // from it, so a collision would silently merge two sources downstream.
    expect(new Set(ids).size).toBe(ids.length);
  });
});
