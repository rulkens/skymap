/**
 * `Layer.bodies` is inert: `data/bodies/layerBodyRows.ts` folds each Layer's rows
 * into the body tables by direct import, so a Layer could declare rows, skip that
 * edit and ship green with its bodies absent.
 */

import { describe, it, expect } from 'vitest';

import { APP_COMPOSITION } from '../../src/compositions/app';
import { LAYER_BODY_ROWS } from '../../src/data/bodies/layerBodyRows';
import type { LayerBody } from '../../src/@types/engine/layer/LayerBody';

describe('LAYER_BODY_ROWS covers every composed Layer', () => {
  it("LAYER_BODY_ROWS covers every composed Layer's bodies, by identity", () => {
    const declared = APP_COMPOSITION.layers.flatMap<LayerBody>((layer) => layer.bodies ?? []);
    // Guards the guard: an empty list would make the loop below vacuous.
    expect(declared.length).toBeGreaterThan(0);
    for (const row of declared) {
      expect(LAYER_BODY_ROWS).toContain(row);
    }
  });
});
