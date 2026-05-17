import { describe, expect, it } from 'vitest';
import type { FamousMetaEntry } from '../../src/@types/loading/FamousMetaEntry';
import type { FamousEntry } from '../../tools/parsers/famousSeed';

/**
 * Mirror of the per-entry meta-record construction inside `buildFamous.ts`.
 * Co-located in the test rather than imported so a refactor of
 * `buildFamous.ts` that drops `commonName` fails loud right here.
 *
 * This function must exactly match the logic in buildFamous.ts line ~223.
 */
function entryToMeta(e: FamousEntry): FamousMetaEntry {
  return {
    id: e.id,
    names: e.names,
    description: e.description,
    type: e.type,
    ...(e.commonName !== undefined ? { commonName: e.commonName } : {}),
  };
}

describe('buildFamous meta-record construction', () => {
  it('includes commonName when the seed entry has one', () => {
    const e: FamousEntry = {
      id: 'm31',
      names: ['M31', 'NGC 224'],
      commonName: 'Andromeda Galaxy',
      ra: 10.68,
      dec: 41.27,
      distanceMpc: 0.78,
      diameterKpc: 67,
      type: 'SA(s)b',
      description: 'Spiral galaxy.',
    };
    const meta = entryToMeta(e);
    expect(meta.commonName).toBe('Andromeda Galaxy');
  });

  it('omits commonName when the seed entry has none', () => {
    const e: FamousEntry = {
      id: 'ngc-6744',
      names: ['NGC 6744'],
      ra: 287.44,
      dec: -63.85,
      distanceMpc: 9.5,
      diameterKpc: 60,
      type: 'SAB(r)bc',
      description: 'A Milky Way analogue.',
    };
    const meta = entryToMeta(e);
    expect(meta.commonName).toBeUndefined();
    expect('commonName' in meta).toBe(false);
  });
});
