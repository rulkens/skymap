/**
 * EngineCallbacks.camera.onPoiFocusChange — type-shape smoke test.
 *
 * Why a runtime test for a pure type slot?  Vitest can only execute, not
 * inspect types directly, but a literal value typed as `EngineCallbacks`
 * exercises the type as a side effect of compilation.  If the slot
 * disappears or its signature changes, this file fails `tsc --noEmit`
 * before the test runner ever loads it.  The runtime `toBeTypeOf` check
 * is the smallest possible assertion that keeps the file from being
 * dead-code-eliminated by an over-eager bundler.
 *
 * Mirrors the type's own path under `src/@types/engine/` so the test
 * file is easy to locate alongside the d.ts it pins down.
 */

import { describe, it, expect } from 'vitest';
import type { EngineCallbacks } from '../../../src/@types/engine/EngineCallbacks';

describe('EngineCallbacks camera.onPoiFocusChange', () => {
  it('accepts a poiId string', () => {
    const cb: EngineCallbacks = {
      lifecycle: { onStatusChange: () => {} },
      selection: { onSelectChange: () => {}, onHoverChange: () => {} },
      camera: { onPoiFocusChange: (poiId: string | null): void => void poiId },
    };
    expect(cb.camera?.onPoiFocusChange).toBeTypeOf('function');
  });
});
