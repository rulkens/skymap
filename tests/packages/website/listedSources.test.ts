import { describe, expect, it } from 'vitest';

import type { Fact } from '../../../packages/website/src/@types/Fact';
import { FACTS } from '../../../packages/website/src/data/facts';
import { listedSources } from '../../../packages/website/src/utils/listedSources';

const row = (id: string, about?: 'app'): Fact => ({
  id,
  text: id,
  source: 'https://example.org/',
  sourceLabel: id,
  checked: '2026-10-06',
  ...(about ? { about } : {}),
});

describe('listedSources', () => {
  it('leaves a statement about the app out of a page’s list, and keeps it with all', () => {
    const rows = [row('moon'), row('keys', 'app'), row('web')];
    expect(listedSources(rows, false).map((r) => r.id)).toEqual(['moon', 'web']);
    expect(listedSources(rows, true).map((r) => r.id)).toEqual(['moon', 'keys', 'web']);
  });

  it('marks the rows of the About and Privacy tables that describe the project, and spares the science rows', () => {
    const listed = new Set(listedSources(FACTS, false).map((r) => r.id));
    for (const r of FACTS.filter((f) => /^(about|privacy)-/.test(f.id))) {
      expect(listed.has(r.id), r.id).toBe(false);
    }
    for (const id of ['sci-directions', 'sim-star-epoch', 'betelgeuse-distance', 'gaia-licence']) {
      expect(listed.has(id), id).toBe(true);
    }
  });
});
