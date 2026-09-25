import { describe, it, expect, vi } from 'vitest';

// SCENE_MESH_BODIES rides the real table (its ids/meshKeys are fixed data);
// only which sites exist and which keys are georeferenced are mocked per test.
let sites: unknown[] = [];
let georeferencedKeys: readonly string[] = [];

vi.mock('../../../../src/data/bodies/surfaceFixedSites', () => ({
  get SURFACE_FIXED_SITES() {
    return sites;
  },
}));

vi.mock('../../../../tools/utils/io/meshSources', () => ({
  get MESH_SOURCES() {
    return Object.fromEntries(
      georeferencedKeys.map((key) => [key, { georeferenced: { anchor: {}, holeOutline: '' } }]),
    );
  },
}));

const { meshAnchorSite } = await import('../../../../tools/utils/meshes/meshAnchorSite');

describe('meshAnchorSite', () => {
  it('returns undefined for a key that is neither georeferenced nor anchored', () => {
    sites = [
      { id: 'curiosity', hostId: 'mars', latDeg: 0, lonDeg: 0, altitudeM: 0, seat: 'resting' },
    ];
    georeferencedKeys = [];
    expect(meshAnchorSite('curiosity')).toBeUndefined();
  });

  it('resolves the site for a georeferenced key backed by exactly one anchored site', () => {
    const site = {
      id: 'hubble',
      hostId: 'earth',
      latDeg: 1,
      lonDeg: 2,
      altitudeM: 0,
      seat: 'anchored',
    };
    sites = [site];
    georeferencedKeys = ['hubble'];
    expect(meshAnchorSite('hubble')).toEqual(site);
  });

  it('throws when a georeferenced key is backed only by a resting site', () => {
    sites = [
      { id: 'hubble', hostId: 'earth', latDeg: 0, lonDeg: 0, altitudeM: 0, seat: 'resting' },
    ];
    georeferencedKeys = ['hubble'];
    expect(() => meshAnchorSite('hubble')).toThrow(/no anchored SurfaceFixedSite uses it/);
  });

  it('throws when an anchored site backs a key with no georeferenced entry', () => {
    sites = [
      { id: 'hubble', hostId: 'earth', latDeg: 0, lonDeg: 0, altitudeM: 0, seat: 'anchored' },
    ];
    georeferencedKeys = [];
    expect(() => meshAnchorSite('hubble')).toThrow(
      /site 'hubble' is anchored but MESH_SOURCES.hubble has no georeferenced entry/,
    );
  });

  it('throws when a georeferenced key has no site backing any of its bodies', () => {
    sites = [];
    georeferencedKeys = ['voyager'];
    expect(() => meshAnchorSite('voyager')).toThrow(/no anchored SurfaceFixedSite uses it/);
  });
});
