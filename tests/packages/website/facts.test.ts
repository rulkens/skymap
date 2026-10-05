import { describe, expect, it } from 'vitest';

import { FACTS } from '../../../packages/website/src/data/facts';
import { fact } from '../../../packages/website/src/data/fact';

describe('website facts', () => {
  it('every row has a unique id, a non-empty text, an https source and an ISO check date', () => {
    const ids = new Set<string>();
    for (const row of FACTS) {
      expect(ids.has(row.id), `duplicate id ${row.id}`).toBe(false);
      ids.add(row.id);
      expect(row.text.trim(), row.id).not.toBe('');
      expect(new URL(row.source).protocol, `${row.id} source`).toBe('https:');
      expect(row.checked, `${row.id} checked`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(row.checked)), `${row.id} checked is a real date`).toBe(false);
    }
  });

  it('an unknown id throws, so a page citing a missing row fails the build', () => {
    expect(() => fact('no-such-fact')).toThrow(/no-such-fact/);
  });
});
