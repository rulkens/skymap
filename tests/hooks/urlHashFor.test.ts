/**
 * URL_HASH_FOR — table-dispatch coverage for the `#focus=<id>` body.
 *
 * One assertion per arm: the galaxy row delegates to the codec ladder
 * (`selectionToFocusId`) and returns null for a non-encodable Synthetic row;
 * the structure row returns the structure's own id.
 */
import { describe, it, expect } from 'vitest';
import { URL_HASH_FOR } from '../../src/hooks/urlHashFor';
import { MILKY_WAY_INFO } from '../../src/data/milkyWay/milkyWayInfo';
import { selectionToFocusId } from '../../src/services/url/focusUrl';
import type { GalaxyInfo } from '../../src/@types/engine/GalaxyInfo';
import type { StructureInfo } from '../../src/@types/data/structure/StructureInfo';
import { Source } from '../../src/data/sources';

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

  it('milkyWay row returns null (no deep-link; clears #focus=)', () => {
    expect(URL_HASH_FOR.milkyWay(MILKY_WAY_INFO)).toBeNull();
  });
});
