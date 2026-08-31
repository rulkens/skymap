/**
 * URL_HASH_FOR — table-dispatch coverage for the `#focus=<id>` body.
 *
 * One assertion per arm: the galaxy row delegates to the codec ladder
 * (`selectionToFocusId`) and returns null for a non-encodable Synthetic row;
 * the structure row returns the structure's own id.
 */
import { describe, it, expect } from 'vitest';
import { URL_HASH_FOR } from '../../../src/services/url/urlHashFor';
import { MILKY_WAY_FOCUS_ID } from '../../../src/services/url/milkyWayFocusId';
import { MILKY_WAY_INFO } from '../../../src/data/milkyWay/milkyWayInfo';
import { selectionToFocusId } from '../../../src/services/url/focusUrl';
import { resolveFocusId } from '../../../src/services/url/resolveFocusId';
import type { GalaxyInfo } from '../../../src/@types/engine/GalaxyInfo';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';
import type { BodyInfo } from '../../../src/@types/engine/BodyInfo';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import { Source } from '../../../src/data/sources';

function makeGalaxy(source: number): GalaxyInfo {
  return {
    type: 'galaxyCatalog',
    source,
    objID: 1234567890n,
    famous: undefined,
    ra: 10,
    dec: 20,
  } as unknown as GalaxyInfo;
}

function makeStructure(id: string): StructureInfo {
  return {
    type: 'structure',
    id,
    name: id,
    category: 'cluster',
    worldPos: [0, 0, 0],
    featured: true,
    physicalRadiusMpc: 2,
  };
}

describe('URL_HASH_FOR', () => {
  it('galaxyCatalog row returns the selectionToFocusId value', () => {
    const galaxy = makeGalaxy(Source.SDSS);
    expect(URL_HASH_FOR.galaxyCatalog(galaxy)).toBe(selectionToFocusId(galaxy));
    expect(URL_HASH_FOR.galaxyCatalog(galaxy)).toBe('sdss-1234567890');
  });

  it('galaxyCatalog row returns null for a non-encodable (Synthetic) galaxy', () => {
    const synthetic = makeGalaxy(Source.Synthetic);
    expect(URL_HASH_FOR.galaxyCatalog(synthetic)).toBeNull();
  });

  it('structure row returns the structure id', () => {
    expect(URL_HASH_FOR.structure(makeStructure('cluster-virgo-m87'))).toBe('cluster-virgo-m87');
  });

  it('milkyWay row returns the fixed deep-link literal', () => {
    expect(URL_HASH_FOR.milkyWay(MILKY_WAY_INFO)).toBe(MILKY_WAY_FOCUS_ID);
    expect(URL_HASH_FOR.milkyWay(MILKY_WAY_INFO)).toBe('milkyWay');
  });

  it('#focus=body-<id> round-trips for a star', () => {
    // A focused body (BodyInfo) encodes to `body-<id>` under the shared prefix,
    // and resolveFocusId decodes it back to the body ref — the deep-link
    // round-trip the feature exists for. 'sirius' is a seeded famous star, so
    // resolveFocusId validates it against the static SCENE_BODIES table (no
    // loaded catalog needed — the minimal deps below suffice).
    const star: BodyInfo = {
      type: 'body',
      id: 'sirius',
      label: 'Sirius',
      positionMpc: [1e-6, 2e-6, 3e-6],
      radiusM: 1192000000,
    };
    const deps: ResolveDeps = {
      catalogs: { get: () => undefined },
      famousGalaxiesMeta: [],
      structures: { byId: () => null },
      stars: { current: () => null },
    };
    const id = URL_HASH_FOR.body(star);
    expect(id).toBe('body-sirius');
    expect(resolveFocusId(id as string, deps)).toEqual({ type: 'body', id: 'sirius' });
  });
});
