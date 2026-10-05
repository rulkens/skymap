import { describe, it, expect } from 'vitest';

import { selectExhibitCopyDelaySec } from '../../../src/state/takeover/selectors';
import type { RootState } from '../../../src/store/types';
import type { Transition } from '../../../src/@types/navigation/Transition';

const stateWith = (entry: Transition) =>
  ({ takeover: { active: { kind: 'exhibit', id: 'cosmicWeb', entry } } }) as unknown as RootState;

describe('selectExhibitCopyDelaySec', () => {
  it('shows a cut exhibit copy at once', () => {
    expect(selectExhibitCopyDelaySec(stateWith('cut'))).toBe(0);
  });
});
