import { describe, expect, it } from 'vitest';
import { CAPTURE_HIDDEN_PASSES } from '../../../tools/capture/captureHiddenPasses';
import { CONTENT_PASSES } from '../../../src/services/engine/frame/passes';

describe('CAPTURE_HIDDEN_PASSES', () => {
  it('every pass the capture hides is a real content pass', () => {
    const knownNames = new Set(CONTENT_PASSES.map((pass) => pass.name));
    for (const hidden of CAPTURE_HIDDEN_PASSES) {
      expect(knownNames.has(hidden)).toBe(true);
    }
  });
});
