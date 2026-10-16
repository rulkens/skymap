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
 * a future refactor drops the structure-click wiring or stops routing the
 * dblclick through the focusSelected command. End-to-end
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

  it('passes the composed resolver to createClickResolver', () => {
    // Structure hits reach the structure Layer's store through the composed
    // resolver's structure row (`composeSelectionRows` → `resolvePick`), not
    // a direct field on the click-resolver input (D5). The resolver is
    // threaded in from `deps.selection` (engine.ts's one instance), not
    // rebuilt here — see F1.
    expect(src).toContain('resolvePick: deps.selection.resolvePick');
  });

  it('routes double-click through the focusSelected command', () => {
    // The command's saga reads the authoritative selection slot, so the handler
    // dispatches it without running a second pick.
    expect(src).toContain('focusSelected()');
  });
});
