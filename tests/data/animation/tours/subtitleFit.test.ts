/**
 * The authoring guard for subtitles: a beat whose dwell is too short for its
 * lines would flash them past unread. Fix by lengthening the dwell or
 * re-breaking the lines, never by lowering SUBTITLE_MIN_READ_SEC.
 */

import { describe, it, expect } from 'vitest';
import { APP_TOUR_REGISTRY } from '../../../../src/compositions/appTours';
import { SUBTITLE_MIN_READ_SEC } from '../../../../src/data/animation/subtitleTiming';
import { lineSchedule } from '../../../../src/utils/animation/lineSchedule';
import { compileClip } from '../../../../src/services/engine/animation/compileClip';
import { resolveClipFoci } from '../../../../src/services/engine/animation/resolveClipFoci';
import { selectionResolverOver } from '../../../support/selectionResolverOver';
import type { SelectionResolver } from '../../../../src/@types/engine/selection/SelectionResolver';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import { installAppSelectionKinds } from '../../../support/installAppSelectionKinds';

installAppSelectionKinds();

// Dwell durations don't depend on what an id resolves to, only that it does.
const ANY_STRUCTURE = {
  type: 'structure',
  category: 'galaxy-group',
  id: 'stub',
  name: 'Stub',
  worldPos: [1, 0, 0],
  featured: true,
  physicalRadiusMpc: 1,
} as StructureInfo;
const BASE = selectionResolverOver({ byId: () => ANY_STRUCTURE, byCategory: () => [] });
const RESOLVER: SelectionResolver = {
  ...BASE,
  resolveFocusId: (id) => {
    const resolution = BASE.resolveFocusId(id);
    return resolution.kind === 'hit' ? resolution : BASE.resolveFocusId('galaxy-group-stub');
  },
};
const FROM = { target: [0, 0, 0] as [number, number, number], yaw: 0, pitch: 0, distance: 5 };

describe('subtitle fit', () => {
  it('every tour beat gives each subtitle line its reading floor', () => {
    const tooShort: string[] = [];
    for (const tour of Object.values(APP_TOUR_REGISTRY)) {
      tour.beats.forEach((beat, i) => {
        if (!beat.caption) return;
        const resolved = resolveClipFoci(beat.dwellClip, RESOLVER, 0.8, FROM, 2451545);
        const { durationSec } = compileClip(resolved);
        lineSchedule(beat.caption.lines, durationSec).forEach((s, j) => {
          const sec = s.endSec - s.startSec;
          if (sec < SUBTITLE_MIN_READ_SEC) {
            tooShort.push(
              `${tour.id} beat ${i}: "${beat.caption!.lines[j]}" gets ${sec.toFixed(2)}s of ${durationSec}s`,
            );
          }
        });
      });
    }
    expect(tooShort).toEqual([]);
  });
});
