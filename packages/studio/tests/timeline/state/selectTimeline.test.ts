import { describe, it, expect } from 'vitest';

import { openStudioStore } from '../../helpers/openStudioStore';
import { dollyTo, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import {
  draftResolved,
  paramEdited,
  rowSelected,
  rowToggled,
} from '../../../src/session/state/studioSlice';
import { selectRevision, selectDraft } from '../../../src/session/state/selectors';
import { selectTimeline } from '../../../src/timeline/state/selectTimeline';
import { selectSelectedRow } from '../../../src/timeline/state/selectSelectedRow';
import { selectSelectionStandInId } from '../../../src/timeline/state/selectSelectionStandInId';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';

const DRAFT: ClipData = { timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)], { overlap: 1 })] };

const open = () => openStudioStore(DRAFT, { resolve: false });

/** The saga's job, by hand: land the draft itself (it has no focus ids) for its current revision. */
const resolve = (store: ReturnType<typeof open>) =>
  store.dispatch(
    draftResolved({
      revision: selectRevision(store.getState()),
      data: selectDraft(store.getState())!,
    }),
  );

describe('timeline selectors', () => {
  it('the timeline is unresolved until the current revision resolves, then timed', () => {
    const store = open();
    expect(selectTimeline(store.getState())!.rows[1]).toMatchObject({
      startSec: null,
      duration: '–',
    });

    resolve(store);

    const timeline = selectTimeline(store.getState())!;
    expect(timeline.durationSec).toBe(7);
    expect(timeline.rows.find((r) => r.id === 'e:0.1')).toMatchObject({ startSec: 3, endSec: 7 });
  });

  it('an edit that breaks the clip yields an error timeline with the culprits marked', () => {
    const store = open();
    resolve(store);
    // An overlap longer than the steps it joins.
    store.dispatch(
      paramEdited({
        ref: { kind: 'effect', path: [0] },
        param: 'overlap',
        value: 9,
        label: 'Blend',
        gesture: null,
      }),
    );
    expect(selectTimeline(store.getState())!.error).toBeNull();
    expect(selectTimeline(store.getState())!.rows[1]!.startSec).toBeNull();

    resolve(store);

    const timeline = selectTimeline(store.getState())!;
    expect(timeline.error).toMatchObject({ reason: 'seqOverlap' });
    expect(timeline.rows.filter((r) => r.errors.length > 0).map((r) => r.id)).toEqual(['e:0']);
  });

  it('a selection survives folding its group, and the folded group stands in for it', () => {
    const store = open();
    store.dispatch(rowSelected({ kind: 'effect', path: [0, 1] }));
    expect(selectSelectionStandInId(store.getState())).toBe('e:0.1');

    store.dispatch(rowToggled('e:0'));

    expect(selectTimeline(store.getState())!.rows.map((r) => r.id)).toEqual(['start', 'e:0']);
    expect(selectSelectedRow(store.getState())?.id).toBe('e:0.1');
    expect(selectSelectionStandInId(store.getState())).toBe('e:0');
  });
});
