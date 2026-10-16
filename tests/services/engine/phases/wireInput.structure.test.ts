/**
 * wireInput.structure — a source-string guard that the pick driver resolves
 * hits through the engine's one composed resolver, not a rebuilt one. The
 * driver itself needs a GPU pick program, so its behaviour is pinned in
 * `createPickDriver.test.ts` and by manual smoke (click selects, hover card).
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

  it('passes the composed resolver to createPickDriver', () => {
    // Structure hits reach the structure Layer's store through the composed
    // resolver's structure row (`composeSelectionRows` → `resolvePick`), not
    // a direct field on the pick-driver deps (D5). The resolver is
    // threaded in from `deps.selection` (engine.ts's one instance), not
    // rebuilt here — see F1.
    expect(src).toContain('resolvePick: deps.selection.resolvePick');
  });
});
