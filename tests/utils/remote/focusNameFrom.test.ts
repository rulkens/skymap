import { describe, expect, it } from 'vitest';
import { focusNameFrom } from '../../../src/utils/remote/focusNameFrom';

describe('focusNameFrom', () => {
  it('finds a name among search matches, else null', () => {
    const searchMatches = [
      { name: 'Andromeda', kind: 'galaxy', action: { kind: 'focus', focusId: 'm31' } as const },
      { name: 'Grand Tour', kind: 'tour', action: { kind: 'tour', tourId: 'grandTour' } as const },
    ];
    expect(focusNameFrom('m31', { searchMatches })).toBe('Andromeda');
    expect(focusNameFrom('m33', { searchMatches })).toBeNull();
  });
});
