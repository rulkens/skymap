/**
 * /api/galaxies — returns the 75 seed entries augmented with a
 * `curated: boolean` flag derived from the override index.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { handleGalaxies } from '../../../../tools/famous-curator/plugin/routes/galaxies';

function seedFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'curator-galaxies-'));
  mkdirSync(resolve(root, 'data'), { recursive: true });
  const entries = [
    { id: 'm31', names: ['M31'], ra: 10.6, dec: 41.2, distanceMpc: 0.78, diameterKpc: 67, type: 'Sb', description: 'A' },
    { id: 'm33', names: ['M33'], ra: 23.4, dec: 30.6, distanceMpc: 0.84, diameterKpc: 19, type: 'Sc', description: 'B' },
    { id: 'm51', names: ['M51'], ra: 202.4, dec: 47.2, distanceMpc: 7.2, diameterKpc: 23, type: 'Sa', description: 'C' },
  ];
  writeFileSync(resolve(root, 'data/famous_galaxies.seed.json'), JSON.stringify(entries));
  return root;
}

describe('handleGalaxies', () => {
  it('returns all seed entries with curated=false when no override file exists', async () => {
    const repo = seedFixture();
    const out = await handleGalaxies({ repoRoot: repo });
    expect(out.galaxies).toHaveLength(3);
    expect(out.galaxies.every((g) => g.curated === false)).toBe(true);
    expect(out.galaxies[0]!.id).toBe('m31');
  });

  it('flips curated=true for ids present in the override index', async () => {
    const repo = seedFixture();
    writeFileSync(
      resolve(repo, 'data/famous_curated_overrides.json'),
      JSON.stringify({
        version: 1,
        entries: {
          m31: {
            dir: 'famous-curated/m31', sourceUrl: 'x', license: 'CC-BY',
            author: 'A', processedAt: '2026-05-18T00:00:00Z',
          },
        },
      }),
    );
    const out = await handleGalaxies({ repoRoot: repo });
    const m31 = out.galaxies.find((g) => g.id === 'm31');
    const m33 = out.galaxies.find((g) => g.id === 'm33');
    expect(m31?.curated).toBe(true);
    expect(m33?.curated).toBe(false);
  });
});
