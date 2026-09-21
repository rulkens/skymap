import { describe, it, expect } from 'vitest';
import { poseSnippetOf } from '../../../src/components/DebugPanel/poseSnippetOf';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';

// Not exercised by CameraStateSection.test.ts (no "copy view pose" click there),
// and a wrong field order here would paste a syntactically valid but silently
// wrong pose into viewRegistry.ts — full precision, so the curator's stood-at
// target reads back exactly, not a rounded neighbour.
describe('poseSnippetOf', () => {
  it('formats a pose as a viewRegistry.ts-ready snippet, full precision', () => {
    const pose: CameraPose = { target: [1.1, -2.2, 3.3], yaw: 0.5, pitch: -0.25, distance: 10 };
    expect(poseSnippetOf(pose)).toBe(
      'pose: { target: [1.1, -2.2, 3.3], yaw: 0.5, pitch: -0.25, distance: 10 }',
    );
  });
});
