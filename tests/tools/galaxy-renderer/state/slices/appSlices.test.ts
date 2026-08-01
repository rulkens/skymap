/**
 * compare/extras/ui slices — one-shot view requests, the fit-run lifecycle,
 * and the app-chrome toggles.
 */
import { describe, expect, it } from 'vitest';

import compareReducer, {
  comparePanelToggled,
  fitFinished,
  fitProgressed,
  fitReportSet,
  fitStarted,
  fitStopRequested,
  referenceSelected,
  viewRequested,
} from '../../../../../tools/galaxy-renderer/src/state/slices/compareSlice';
import extrasReducer, {
  extrasCountSet,
  extrasRegenerated,
  extrasToggled,
} from '../../../../../tools/galaxy-renderer/src/state/slices/extrasSlice';
import uiReducer, {
  autoRotateSet,
  copyFeedbackSet,
  sectionToggled,
} from '../../../../../tools/galaxy-renderer/src/state/slices/uiSlice';
import { DEFAULT_COMPARE_STATE } from '../../../../../tools/galaxy-renderer/src/data/defaultCompareState';
import { DEFAULT_EXTRAS_STATE } from '../../../../../tools/galaxy-renderer/src/data/defaultExtrasState';
import { DEFAULT_UI_STATE } from '../../../../../tools/galaxy-renderer/src/data/defaultUiState';
import type { MatchReport } from '../../../../../tools/galaxy-renderer/@types/matcher/MatchReport';

const SEEDED_REPORT: MatchReport = {
  armsRef: 4,
  armsRen: 4,
  qRef: 0.6,
  qRen: 0.58,
  dustRef: 0.3,
  dustRen: 0.28,
};

describe('compareSlice', () => {
  it('comparePanelToggled flips open', () => {
    const next = compareReducer(DEFAULT_COMPARE_STATE, comparePanelToggled());
    expect(next.open).toBe(!DEFAULT_COMPARE_STATE.open);
  });

  it('referenceSelected sets activeId and clears a seeded report', () => {
    const seeded = { ...DEFAULT_COMPARE_STATE, report: SEEDED_REPORT };
    const next = compareReducer(seeded, referenceSelected('m81'));

    expect(next.activeId).toBe('m81');
    expect(next.report).toBeNull();
  });

  it('viewRequested bumps the nonce across two dispatches', () => {
    const pose = { az: 0.6, el: 0.3, dist: 4 };

    const first = compareReducer(DEFAULT_COMPARE_STATE, viewRequested(pose));
    expect(first.viewIntent).toEqual({ pose, nonce: 1 });

    const second = compareReducer(first, viewRequested(pose));
    expect(second.viewIntent).toEqual({ pose, nonce: 2 });
  });

  it('fitStarted resets exactly the documented fit fields', () => {
    const dirty = {
      ...DEFAULT_COMPARE_STATE,
      fitProgress: 0.5,
      fitScore: 77,
      fitNote: 'stale',
      report: SEEDED_REPORT,
      stopRequested: true,
    };
    const next = compareReducer(dirty, fitStarted());

    expect(next.fitting).toBe(true);
    expect(next.fitProgress).toBe(0.02);
    expect(next.fitScore).toBeNull();
    expect(next.fitNote).toBe('reading photo…');
    expect(next.report).toBeNull();
    expect(next.stopRequested).toBe(false);
  });

  it('fitProgressed writes progress/score/note', () => {
    const next = compareReducer(
      DEFAULT_COMPARE_STATE,
      fitProgressed({ progress: 0.5, score: 60, note: 'iterating' }),
    );

    expect(next.fitProgress).toBe(0.5);
    expect(next.fitScore).toBe(60);
    expect(next.fitNote).toBe('iterating');
  });

  it('fitReportSet writes the report', () => {
    const next = compareReducer(DEFAULT_COMPARE_STATE, fitReportSet(SEEDED_REPORT));
    expect(next.report).toEqual(SEEDED_REPORT);
  });

  it('fitFinished clears fitting and stopRequested', () => {
    const running = { ...DEFAULT_COMPARE_STATE, fitting: true, stopRequested: true };
    const next = compareReducer(running, fitFinished());

    expect(next.fitting).toBe(false);
    expect(next.stopRequested).toBe(false);
  });

  it('fitStopRequested sets stopRequested', () => {
    const next = compareReducer(DEFAULT_COMPARE_STATE, fitStopRequested());
    expect(next.stopRequested).toBe(true);
  });
});

describe('extrasSlice', () => {
  it('extrasToggled flips enabled', () => {
    const next = extrasReducer(DEFAULT_EXTRAS_STATE, extrasToggled(true));
    expect(next.enabled).toBe(true);
  });

  it('extrasCountSet writes count', () => {
    const next = extrasReducer(DEFAULT_EXTRAS_STATE, extrasCountSet(12));
    expect(next.count).toBe(12);
  });

  it('extrasRegenerated increments the nonce across two dispatches', () => {
    const first = extrasReducer(DEFAULT_EXTRAS_STATE, extrasRegenerated());
    expect(first.regenNonce).toBe(1);

    const second = extrasReducer(first, extrasRegenerated());
    expect(second.regenNonce).toBe(2);
  });
});

describe('uiSlice', () => {
  it('sectionToggled flips exactly one section', () => {
    const next = uiReducer(DEFAULT_UI_STATE, sectionToggled('dust'));

    // Relative to the defaults, not literal booleans: which sections BOOT
    // open is a product decision this test has no stake in.
    expect(next.openSections.dust).toBe(!DEFAULT_UI_STATE.openSections.dust);
    expect(next.openSections.arms).toBe(DEFAULT_UI_STATE.openSections.arms);
  });

  it('copyFeedbackSet writes and clears the message', () => {
    const set = uiReducer(DEFAULT_UI_STATE, copyFeedbackSet('copied ✓'));
    expect(set.copyFeedback).toBe('copied ✓');

    const cleared = uiReducer(set, copyFeedbackSet(''));
    expect(cleared.copyFeedback).toBe('');
  });

  it('autoRotateSet writes the flag', () => {
    const next = uiReducer(DEFAULT_UI_STATE, autoRotateSet(false));
    expect(next.autoRotate).toBe(false);
  });
});
