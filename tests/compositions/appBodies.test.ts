/**
 * `Layer.bodies` is inert: `compositions/appBodies.ts` collects each Layer's rows
 * by direct import, so a Layer could declare rows, skip that
 * edit and ship green with its bodies absent.
 */

import { describe, it, expect } from 'vitest';

import { APP_COMPOSITION } from '../../src/compositions/app';
import { APP_BODY_REGISTRY } from '../../src/compositions/appBodies';
import type { LayerBody } from '../../src/@types/engine/layer/LayerBody';

describe('APP_BODY_REGISTRY covers every composed Layer', () => {
  it("APP_BODY_REGISTRY covers every composed Layer's bodies, by identity", () => {
    const declared = APP_COMPOSITION.layers.flatMap<LayerBody>((layer) => layer.bodies ?? []);
    // Guards the guard: an empty list would make the loop below vacuous.
    expect(declared.length).toBeGreaterThan(0);
    for (const row of declared) {
      expect(APP_BODY_REGISTRY).toContain(row);
    }
  });
});
