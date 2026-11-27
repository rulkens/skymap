import { describe, expect, it } from 'vitest';

import { loopSpanOf } from '../../../src/session/utils/loopSpanOf';
import type { Timeline } from '../../../src/@types/rows/Timeline';
import type { TimelineRow } from '../../../src/@types/rows/TimelineRow';

const TIMELINE = { durationSec: 12 } as Timeline;
const rowAt = (startSec: number, endSec: number, tailEndSec: number) =>
  ({ startSec, endSec, tailEndSec }) as TimelineRow;

describe('loopSpanOf', () => {
  it("a cue's fade tail past End loops only up to End, where the transport can wrap", () => {
    // A Hide at 11 s over 3 s takes no clock time; its tail runs to 14 s on a 12 s clip.
    expect(loopSpanOf(rowAt(11, 11, 14), TIMELINE)).toEqual({ startSec: 11, endSec: 12 });
  });

  it('a cue at exactly End loops the whole clip', () => {
    expect(loopSpanOf(rowAt(12, 12, 14), TIMELINE)).toEqual({ startSec: 0, endSec: 12 });
  });
});
