import { describe, it, expect } from 'vitest';
import { focusIdForRow } from '../../../../src/components/CommandPalette/utils/focusIdForRow';
import { Source } from '../../../../src/data/sources';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';
import type { AliasIndexEntry } from '../../../../src/@types/engine/AliasIndexEntry';

const M31: FamousMetaEntry = {
  id: 'm31',
  names: ['M31', 'Andromeda Galaxy'],
  description: '',
  type: 'Sb',
};

const NGC4565: AliasIndexEntry = {
  pgc: 42038n,
  names: ['NGC 4565'],
  source: Source.Glade,
  localIdx: 7,
};

describe('focusIdForRow', () => {
  it('a famous row → its curated seed id', () => {
    expect(focusIdForRow({ kind: 'famous', entry: M31, score: 0 })).toBe('m31');
  });

  it('an alias row → the shared galaxy-id ladder pgc- rung', () => {
    expect(focusIdForRow({ kind: 'alias', entry: NGC4565, score: 0 })).toBe('pgc-42038');
  });

  it('the Milky Way row → the durable singleton focus id', () => {
    expect(focusIdForRow({ kind: 'milkyWay', score: 0 })).toBe('milkyWay');
  });
});
