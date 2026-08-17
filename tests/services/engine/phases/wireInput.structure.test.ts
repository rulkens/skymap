/**
 * wireInput.structure — structural assertion that the wireInput phase wires
 * structure clicks through the click resolver and dispatches Redux actions
 * for select and focus on click/dblclick.
 *
 * ### Why a source-string assertion
 *
 * The click flow is hard to unit-test in isolation: it requires a real
 * galaxyPickRenderer (GPU device), real orbit controls, and a real mouse
 * device.  This is a crude source-string guard — it regresses loudly if
 * a future refactor drops the structure-click wiring or stops reading the
 * authoritative selection ref for the dblclick focus. End-to-end
 * behaviour (single-click opens InfoCard, double-click tweens camera) is
 * verified by manual smoke.
 *
 * If this ever feels too fragile, promote it to a stub-based test that
 * exercises the actual `onClick` / `onDoubleClick` callbacks against a
 * mocked `runPickAtCss`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const wireInputPath = resolve(__dirname, '../../../../src/services/engine/phases/wireInput.ts');

describe('wireInput structure wiring', () => {
  const src = readFileSync(wireInputPath, 'utf8');

  it('passes the structure store to createClickResolver', () => {
    expect(src).toContain('structures: state.data.structures');
  });

  it('reads the authoritative selection slot for the dblclick focus', () => {
    // The dblclick handler reads the pinned ref from the store via the
    // `selectSelectedRef` selector — the slot is the single source of truth
    // (galaxy OR structure OR null).
    expect(src).toContain('selectSelectedRef(');
  });

  it('routes double-click through an updateSelectionFocus dispatch', () => {
    // The dblclick handler unconditionally dispatches `updateSelectionFocus(ref)`
    // where `ref` is whatever `selectSelectedRef` returns. When the ref is null
    // (empty-space dblclick) the reducer treats it as a focus release, lifting
    // the cluster-focus fade — no separate empty-space branch needed.
    expect(src).toContain('updateSelectionFocus(');
  });
});
