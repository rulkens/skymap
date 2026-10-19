import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VOYAGE_DESTINATIONS } from '../../../src/data/voyage/voyageDestinations';
import { raDecDistToCartesian } from '../../../src/utils/math/raDecDistToCartesian';

type SeedRow = { readonly id: string; readonly ra: number; readonly dec: number; readonly distanceMpc: number };

const SEED: readonly SeedRow[] = JSON.parse(
  readFileSync(join(process.cwd(), 'data', 'seeds', 'famous_galaxies.seed.json'), 'utf8'),
);

describe('VOYAGE_DESTINATIONS', () => {
  it.each(['m31', 'm87'] as const)('voyageDestinations: %s matches the famous seed', (id) => {
    const row = SEED.find((r) => r.id === id)!;
    const want = raDecDistToCartesian(row.ra, row.dec, row.distanceMpc);
    const got = VOYAGE_DESTINATIONS[id].positionMpc;
    const scale = Math.hypot(...want);
    for (let i = 0; i < 3; i += 1) expect(Math.abs(got[i]! - want[i]!) / scale).toBeLessThan(1e-6);
  });
});
