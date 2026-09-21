/**
 * Ratchet: every EXISTING `src/layers/<name>/state/` folder matches the shape
 * D1–D3 landed — `slices.ts` (+ optional `defaults.ts`) at the root, each
 * slice folder holding exactly `slice.ts`, `initialState.ts`, `selectors.ts`.
 * A Layer with no `state/` conforms (`Layer.settings` is optional). Layers
 * are discovered dynamically, so one added tomorrow is swept with nobody
 * remembering. `LAYER_STATE_SHAPE_PENDING` is a shrink-only ratchet.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LAYER_STATE_SHAPE_PENDING: ReadonlySet<string> = new Set([]);

const LAYER_NAMES = readdirSync('src/layers', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
expect(LAYER_NAMES.length).toBeGreaterThan(0);

const ROOT_FILES_ALLOWED = new Set(['slices.ts', 'defaults.ts']);
const SLICE_FILES_REQUIRED = ['slice.ts', 'initialState.ts', 'selectors.ts'];

/** Every way `src/layers/<name>/state/` can diverge from the shape, or `[]` if it matches. */
function shapeViolations(layerName: string): string[] {
  const stateDir = join('src/layers', layerName, 'state');
  if (!existsSync(stateDir)) return [];

  const violations: string[] = [];
  const rootEntries = readdirSync(stateDir, { withFileTypes: true });

  if (!rootEntries.some((entry) => entry.isFile() && entry.name === 'slices.ts')) {
    violations.push(`${layerName}: missing state/slices.ts`);
  }

  for (const entry of rootEntries) {
    if (entry.isFile()) {
      if (!ROOT_FILES_ALLOWED.has(entry.name)) {
        violations.push(`${layerName}: unexpected file state/${entry.name}`);
      }
      continue;
    }
    const sliceDir = join(stateDir, entry.name);
    const sliceEntries = readdirSync(sliceDir, { withFileTypes: true });
    for (const required of SLICE_FILES_REQUIRED) {
      if (!sliceEntries.some((e) => e.isFile() && e.name === required)) {
        violations.push(`${layerName}: missing state/${entry.name}/${required}`);
      }
    }
    for (const sliceEntry of sliceEntries) {
      if (sliceEntry.isDirectory()) {
        violations.push(
          `${layerName}: unexpected nested folder state/${entry.name}/${sliceEntry.name}/`,
        );
      } else if (!SLICE_FILES_REQUIRED.includes(sliceEntry.name)) {
        violations.push(`${layerName}: unexpected file state/${entry.name}/${sliceEntry.name}`);
      }
    }
  }

  return violations;
}

describe('Layer state/ folders match the shape', () => {
  it.each(LAYER_NAMES.filter((name) => !LAYER_STATE_SHAPE_PENDING.has(name)))('%s', (name) => {
    const violations = shapeViolations(name);
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it.each([...LAYER_STATE_SHAPE_PENDING])('%s still violates the state/ shape', (name) => {
    expect(LAYER_NAMES).toContain(name);
    expect(shapeViolations(name).length).toBeGreaterThan(0);
  });
});
