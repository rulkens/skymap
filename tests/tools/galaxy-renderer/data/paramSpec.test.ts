/**
 * PARAM_SPEC — verbatim port of the spike's SPEC table
 * (`Galaxy Renderer.dc.html:450-461`), plus four keys the spike ranged via
 * `mk()`'s inline fallback args instead of SPEC (`hii`/`dustRing`/
 * `dustRingWidth`/`dustRingStrength`, html:776-782 — see `paramSpec.ts`'s
 * docblock). Every row must be a valid range (min < max, positive step)
 * and every key must be a real `GalaxyParams` field — a typo here would
 * silently produce a dead slider.
 */
import { describe, expect, it } from 'vitest';
import { PARAM_SPEC } from '../../../../tools/galaxy-renderer/src/data/paramSpec';

describe('PARAM_SPEC', () => {
  it('every entry has min < max and positive step', () => {
    for (const [key, entry] of Object.entries(PARAM_SPEC)) {
      expect(entry!.min, `${key}.min`).toBeLessThan(entry!.max);
      expect(entry!.step, `${key}.step`).toBeGreaterThan(0);
    }
  });
});
