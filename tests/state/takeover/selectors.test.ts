import { describe, it, expect } from 'vitest';

import { selectExhibitCopyDelaySec } from '../../../src/state/takeover/selectors';
import { FLY_TO_POSE_SEC } from '../../../src/data/animation/clips/makers/flyToPoseClip';
import { EXHIBIT_COPY_LEAD_SEC } from '../../../src/data/exhibits/exhibitCopyLeadSec';
import type { RootState } from '../../../src/store/types';
import type { Transition } from '../../../src/@types/navigation/Transition';

const stateWith = (entry: Transition) =>
  ({ takeover: { active: { kind: 'exhibit', id: 'cosmicWeb', entry } } }) as unknown as RootState;

describe('selectExhibitCopyDelaySec', () => {
  it('shows a cut exhibit copy at once', () => {
    expect(selectExhibitCopyDelaySec(stateWith('cut'))).toBe(0);
  });

  it('holds a flown exhibit copy until just before the fly lands', () => {
    expect(selectExhibitCopyDelaySec(stateWith('fly'))).toBe(
      FLY_TO_POSE_SEC - EXHIBIT_COPY_LEAD_SEC,
    );
  });
});
