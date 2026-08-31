/**
 * targetParity — cross-checks between three independently maintained lists
 * that all name render targets by the same bare string: the declared
 * `renderTargetRows` table, `CONTENT_LAYERS`' `target` field, and
 * `frameProgram`'s `'render'`/`'composite'` steps. Nothing type-checks a
 * `ContentLayer.target`/`FrameStep.target` string against the row table — a
 * typo produces an empty `.filter()` group instead of an error at the typo
 * site, so the layer silently never draws (`executeFrame.ts:193`, no throw,
 * no test failure). These are structural invariants over real production
 * data, not registry restatements (`testing.md`).
 */

import { describe, it, expect } from 'vitest';

import { renderTargetRows } from '../../../../src/services/gpu/renderTargets';
import { CONTENT_LAYERS } from '../../../../src/services/engine/frame/passes';
import { frameProgram } from '../../../../src/services/engine/frame/frameProgram';

const ROWS = renderTargetRows('bgra8unorm');
const ROW_IDS = new Set(ROWS.map((row) => row.id));

describe('render-target parity', () => {
  it('every CONTENT_LAYERS target names a declared render-target row', () => {
    for (const layer of CONTENT_LAYERS) {
      expect(ROW_IDS.has(layer.target)).toBe(true);
    }
  });

  it('every frameProgram step names a declared render-target row', () => {
    const program = frameProgram({ exposure: 1, curve: 0, hdrKnee: 0, hdrHeadroom: 0 }, true);
    for (const step of program) {
      if (step.kind === 'render') {
        expect(ROW_IDS.has(step.target)).toBe(true);
      } else if (step.kind === 'composite') {
        expect(ROW_IDS.has(step.step.source)).toBe(true);
        expect(ROW_IDS.has(step.step.dest)).toBe(true);
      }
    }
  });

  it('render-target row ids are unique', () => {
    expect(ROW_IDS.size).toBe(ROWS.length);
  });
});
