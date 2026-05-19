/**
 * wireInput.poi — structural assertion that the wireInput phase wires
 * POI clicks through to `commitPoiFocus` via the click resolver's
 * `resolvePoi` callback.
 *
 * ### Why a source-string assertion
 *
 * The click flow is hard to unit-test in isolation: it requires a real
 * pickRenderer (GPU device), real orbit controls, and a real mouse
 * device.  The plan accepts a crude source-string guard here — it
 * regresses loudly if a future refactor inadvertently drops the
 * `resolvePoi` callback or stops importing `commitPoiFocus`.  The
 * end-to-end behaviour (single-click opens InfoCard, double-click
 * tweens camera) is verified by the manual smoke step in Task 15.
 *
 * If this test ever feels too fragile (e.g. someone renames the
 * symbol but keeps the contract), promote it to a stub-based test
 * that exercises the actual `onClick` callback against a mocked
 * `runPickAtCss` returning a `'poi'` resolution.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const wireInputPath = resolve(__dirname, '../../../../src/services/engine/phases/wireInput.ts');

describe('wireInput POI wiring', () => {
  const src = readFileSync(wireInputPath, 'utf8');

  it('passes a resolvePoi callback to createClickResolver', () => {
    expect(src).toContain('resolvePoi');
  });

  it('imports commitPoiFocus for the POI single-click branch', () => {
    expect(src).toContain('commitPoiFocus');
  });

  it('caches the most-recent POI hit for the dblclick handler', () => {
    expect(src).toContain('lastClickedPoi');
  });

  it('routes double-click on a cached POI through camera.focusOn', () => {
    // The unified focusOn (since 2026-05-19) takes either a GalaxyInfo or
    // a PointOfInterest and dispatches internally.  The dblclick handler
    // passes `lastClickedPoi` — a PointOfInterest — through the same
    // method the single-click galaxy path uses.
    expect(src).toContain('focusOn(lastClickedPoi)');
  });
});
