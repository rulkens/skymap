import { describe, it, expect } from 'vitest';
import { pickProperName } from '../../../../src/components/CommandPalette/utils/pickProperName';

describe('pickProperName', () => {
  it('returns the first non-designation name', () => {
    expect(pickProperName(['M31', 'NGC 224', 'Andromeda Galaxy'])).toBe('Andromeda Galaxy');
  });

  it('falls back to names[0] when every name is a designation', () => {
    expect(pickProperName(['NGC 1300', 'PGC 12412'])).toBe('NGC 1300');
  });

  it('returns "?" for an empty list', () => {
    expect(pickProperName([])).toBe('?');
  });
});
