/**
 * Pins the tour's frame ladder (docs/tour/implementation-notes.md):
 * openingTitle → galactic, approachM31 → supergalactic, homeAgain → galactic.
 * `OrientationFrameId` has four valid values, so a future edit picking a
 * different VALID one (e.g. `equatorial` for `supergalactic`) would compile
 * clean and pass every other test, then roll a beat's whole dwell against the
 * wrong pole — exactly the failure this task exists to prevent. Nothing else
 * exercises these literals.
 */
import { describe, it, expect } from 'vitest';
import { openingTitle } from '../../../../../src/data/animation/tours/grandTour/openingTitle';
import { approachM31 } from '../../../../../src/data/animation/tours/grandTour/approachM31';
import { homeAgain } from '../../../../../src/data/animation/tours/grandTour/homeAgain';

describe('grand tour frame ladder', () => {
  it('openingTitle sets galactic', () => {
    expect(openingTitle.timeline).toContainEqual(
      expect.objectContaining({ kind: 'frameTo', frame: 'galactic' }),
    );
  });

  it('approachM31 sets supergalactic', () => {
    expect(approachM31.timeline).toContainEqual(
      expect.objectContaining({ kind: 'frameTo', frame: 'supergalactic' }),
    );
  });

  it('homeAgain sets galactic', () => {
    expect(homeAgain.timeline).toContainEqual(
      expect.objectContaining({ kind: 'frameTo', frame: 'galactic' }),
    );
  });
});
