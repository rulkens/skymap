/**
 * Parity test for structureMarker/ringPick.wesl.
 *
 * ### Why we test the shader as text
 *
 * The shader can't be executed under Vitest — there's no WebGPU device
 * in the node test runner.  But we can still guard the wiring that
 * matters: the encoding constant the fragment uses MUST be the same
 * `PICK_SENTINEL_OFFSET` the TS side decodes against.  Asserting on
 * the import line (rather than re-inlining the literal value) means
 * the WESL lib in `lib/selectionEncoding.wesl` remains the single
 * source of truth — a separate parity test in
 * `tests/data/selectionEncoding.test.ts` already proves that lib
 * constant matches the TS constant.
 *
 * Mirrors the `?raw` import pattern used elsewhere in the suite for
 * shader-text assertions (see `tests/data/selectionEncoding.test.ts`'s
 * regex walk over `selectionEncoding.wesl`).
 */

import { describe, it, expect } from 'vitest';
// eslint-disable-next-line import/no-unresolved -- ?raw is a Vite query suffix
import ringPickCode from '../../../../../src/services/gpu/shaders/structureMarker/ringPick.wesl?raw';
import {
  PICK_SENTINEL_OFFSET,
  SELECTION_SOURCE_SHIFT,
} from '../../../../../src/data/selectionEncoding';

describe('ringPick.wesl', () => {
  it('imports PICK_SENTINEL_OFFSET from the canonical lib path', () => {
    // Asserting on the IMPORT line (rather than re-asserting the literal
    // value) keeps `lib/selectionEncoding.wesl` as the single authority.
    // A separate parity test already proves the lib constant matches the
    // TS constant — so if this shader imports from the lib, the value
    // is guaranteed correct.
    expect(ringPickCode).toContain('import package::lib::selectionEncoding::PICK_SENTINEL_OFFSET');
    // Sanity: the TS constant is the value downstream readers subtract.
    // If this ever changes, both this shader and the lib will need to
    // update in lock-step.
    expect(PICK_SENTINEL_OFFSET).toBe(1);
  });

  it('imports SELECTION_SOURCE_SHIFT from the canonical lib path', () => {
    // Was a hardcoded `<< 27u` literal until the mcpm-workbench prep task
    // (found by the P2 scout as the one production shader that bypassed
    // the shared module). Asserting on the import — not a re-inlined
    // literal — is what stops this file from going stale again the next
    // time the shift changes.
    expect(ringPickCode).toContain(
      'import package::lib::selectionEncoding::SELECTION_SOURCE_SHIFT',
    );
    expect(SELECTION_SOURCE_SHIFT).toBe(26);
  });

  it('declares the SourceUniforms binding at @group(2) @binding(0)', () => {
    expect(ringPickCode).toMatch(
      /@group\(2\)\s+@binding\(0\)\s+var<uniform>\s+source\s*:\s*SourceUniforms/,
    );
  });

  it('emits the canonical pick packing in the fragment body', () => {
    // (source.sourceCode << SELECTION_SOURCE_SHIFT) | (structureIndex + PICK_SENTINEL_OFFSET)
    expect(ringPickCode).toContain('source.sourceCode << SELECTION_SOURCE_SHIFT');
    expect(ringPickCode).toContain('PICK_SENTINEL_OFFSET');
  });
});
