/**
 * The Roadmap page is chosen by hand from docs/BACKLOG.md and the written
 * designs. The backlog deletes a line when its work starts or ships, and a
 * shipped design moves to `completed/`: these fail then, so the public page
 * cannot go on promising something that exists or was dropped.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROADMAP } from '../../../packages/website/src/data/roadmap';

const ROOT = resolve(import.meta.dirname, '../../..');
const items = ROADMAP.flatMap((group) => group.items);
// One index line: `- [ ] **Title** `mark` — …`.
const marks = new Map(
  [
    ...readFileSync(join(ROOT, 'docs/BACKLOG.md'), 'utf8').matchAll(
      /^- \[ \] \*\*(.+?)\*\* `([\w-]+)`/gm,
    ),
  ].map((match) => [match[1]!, match[2]!]),
);
const STATE_OF_MARK: Record<string, string> = {
  ready: 'planned',
  'needs-design': 'planned',
  'needs-perf': 'planned',
  deferred: 'idea',
  blocked: 'idea',
  'awaiting-decision': 'idea',
  'needs-verification': 'idea',
};

describe('roadmap', () => {
  it('has no id twice and rests every row on a backlog line or a design', () => {
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(items.filter((item) => !item.backlog && !item.spec).map((item) => item.id)).toEqual([]);
  });

  it('names backlog lines that are still on the backlog', () => {
    const gone = items.filter((item) => item.backlog !== undefined && !marks.has(item.backlog));
    expect(gone.map((item) => item.id)).toEqual([]);
  });

  it('names designs that are still open, not filed as completed', () => {
    const gone = items.filter(
      (item) =>
        item.spec !== undefined &&
        (item.spec.includes('/completed/') || !existsSync(join(ROOT, item.spec))),
    );
    expect(gone.map((item) => item.id)).toEqual([]);
  });

  it('gives a row the state its backlog line’s mark stands for, unless a part is built', () => {
    const wrong = items.filter(
      (item) =>
        item.backlog !== undefined &&
        item.state !== 'in progress' &&
        STATE_OF_MARK[marks.get(item.backlog) ?? ''] !== item.state,
    );
    expect(wrong.map((item) => `${item.id}: ${marks.get(item.backlog!)}`)).toEqual([]);
  });

  it('says a row is in progress only where it names the part that is in the repository', () => {
    const unbacked = items.filter(
      (item) =>
        (item.state === 'in progress') !==
        // Code, not a manual: a README can describe what is not built.
        (item.built !== undefined &&
          !item.built.endsWith('.md') &&
          existsSync(join(ROOT, item.built))),
    );
    expect(unbacked.map((item) => item.id)).toEqual([]);
  });
});
