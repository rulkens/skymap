/**
 * orientationFrameLabel — user-facing name for an orientation frame.
 *
 * Each label pairs the astronomical frame name with a plain-language
 * parenthetical naming the plane it levels, so the Display dropdown reads
 * without prior knowledge of celestial coordinate systems. Mirrors
 * `toneMapCurveLabel` (toneMapCurve.ts): an exhaustive switch over the closed
 * `OrientationFrameId` union, with a `never` guard so adding a fifth frame
 * fails to compile until its label is written here rather than falling back to
 * a raw id at runtime.
 */
import type { OrientationFrameId } from '../../@types/camera/OrientationFrameId';

export function orientationFrameLabel(frame: OrientationFrameId): string {
  switch (frame) {
    case 'ecliptic':
      return 'Ecliptic (solar system)';
    case 'equatorial':
      return 'Equatorial (Polaris up)';
    case 'galactic':
      return 'Galactic (Milky Way)';
    case 'supergalactic':
      return 'Supergalactic (superclusters)';
    default: {
      const exhaustive: never = frame;
      return exhaustive;
    }
  }
}
