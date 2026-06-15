/**
 * wireInput.structure — structural assertion that the wireInput phase wires
 * structure clicks through the click resolver and upgrades the pinned
 * selection to a focus on dblclick.
 *
 * ### Why a source-string assertion
 *
 * The click flow is hard to unit-test in isolation: it requires a real
 * pickRenderer (GPU device), real orbit controls, and a real mouse
 * device.  This is a crude source-string guard — it regresses loudly if
 * a future refactor drops the structure-click wiring or stops reading the
 * authoritative selection slot for the dblclick focus. End-to-end
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
    // The dblclick handler reads the pinned target straight from the
    // selection slot rather than caching a resolved copy — the slot is
    // the single source of truth (galaxy OR structure).
    expect(src).toContain('selection.selected()');
  });

  it('routes double-click on the selection through camera.focusOn', () => {
    // The unified focusOn takes either a GalaxyInfo or a StructureInfo
    // and dispatches internally; the dblclick handler hands it the
    // resolved target regardless of category.
    expect(src).toContain('focusOn(target)');
  });

  it('releases focus on an empty-space double-click', () => {
    // Double-clicking the background (no cached galaxy/structure hit) is the
    // inverse of double-clicking a structure: it drops the focus slot so
    // the cluster-focus fade lifts and everything returns to full
    // visibility.  Guards against a refactor that turns the empty-space
    // dblclick back into a bare early-return.
    expect(src).toContain('selection.setFocused(null)');
  });
});
