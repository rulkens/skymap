import { describe, expect, it } from 'vitest';
import { famousDisplayName } from '../../../../src/services/engine/helpers/famousDisplayName';

describe('famousDisplayName', () => {
  it('prefers commonName when set', () => {
    expect(
      famousDisplayName({
        id: 'm31',
        names: ['M31', 'NGC 224'],
        commonName: 'Andromeda Galaxy',
      }),
    ).toBe('Andromeda Galaxy');
  });

  it('falls back to names[0] when commonName is absent', () => {
    expect(famousDisplayName({ id: 'm110', names: ['M110', 'NGC 205'] })).toBe('M110');
  });

  it('falls back to id when names is empty and commonName is absent', () => {
    expect(famousDisplayName({ id: 'orphan', names: [] })).toBe('orphan');
  });

  it('skips an empty-string commonName and uses names[0]', () => {
    expect(famousDisplayName({ id: 'm31', names: ['M31'], commonName: '' })).toBe('M31');
  });

  it('skips empty entries in names and picks the next non-empty', () => {
    expect(famousDisplayName({ id: 'x', names: ['', 'NGC 999'] })).toBe('NGC 999');
  });
});
