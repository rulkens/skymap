import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { structureShotUrl } from '../../../src/utils/structure/structureShotUrl';
import { buildStaticAnchorStructures } from '../../../src/layers/structure/load/buildStaticAnchorStructures';

const DIR = 'public/images/structures';
const anchorIds = buildStaticAnchorStructures().map((s) => s.id);

describe('structureShotUrl', () => {
  it('names the webp by focus id under the structures dir', () => {
    expect(structureShotUrl('galaxy-cluster-virgo-m87')).toBe(
      '/images/structures/galaxy-cluster-virgo-m87.webp',
    );
  });

  it('every featured anchor has its shot on disk', () => {
    const missing = anchorIds.filter((id) => !existsSync(`public${structureShotUrl(id)}`));
    expect(missing).toEqual([]);
  });

  it('no shot on disk belongs to a non-anchor id', () => {
    const known = new Set(anchorIds.map((id) => `${id}.webp`));
    expect(readdirSync(DIR).filter((f) => !known.has(f))).toEqual([]);
  });
});
