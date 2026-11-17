import { describe, expect, it } from 'vitest';

import type { ShotRequest } from '../../../tools/site/@types/ShotRequest';
import { shotRequestFileName } from '../../../tools/site/utils/shotRequestFileName';
import { shotRequestProblems } from '../../../tools/site/utils/shotRequestProblems';

const ids = ['place-virgo', 'saturn'];
const open: ShotRequest = {
  requester: 'home designer',
  page: '/',
  section: 'Pick somewhere to start',
  shotId: 'place-virgo',
  subject: 'Virgo cluster, brighter',
  why: 'too dark beside its neighbours',
  status: 'open',
};

describe('shotRequestProblems', () => {
  it('accepts a full open request, and a new picture', () => {
    expect(shotRequestProblems(open, ids)).toEqual([]);
    expect(
      shotRequestProblems({ ...open, shotId: 'new', size: { width: 1600, height: 1000 } }, ids),
    ).toEqual([]);
  });

  it('names every missing or malformed field', () => {
    const { why: _, ...noWhy } = open;
    expect(shotRequestProblems(noWhy, ids)).toEqual(['`why` is required']);
    expect(shotRequestProblems({ ...open, page: 'home' }, ids)).toHaveLength(1);
    expect(shotRequestProblems({ ...open, shotId: 'virgo' }, ids)[0]).toContain(
      'not in the manifest',
    );
    expect(shotRequestProblems({ ...open, link: '#focus=m31' }, ids)).toHaveLength(1);
    expect(shotRequestProblems({ ...open, size: { width: 1600 } }, ids)).toHaveLength(1);
    expect(shotRequestProblems({ ...open, status: 'closed' }, ids)).toHaveLength(1);
    expect(shotRequestProblems([], ids)).toEqual(['not an object']);
  });

  it('wants an answered request to say what came of it, in shots that exist', () => {
    expect(shotRequestProblems({ ...open, status: 'done' }, ids)).toHaveLength(1);
    expect(shotRequestProblems({ ...open, status: 'done', resultIds: ['saturn'] }, ids)).toEqual(
      [],
    );
    expect(shotRequestProblems({ ...open, status: 'done', resultIds: ['gone'] }, ids)).toHaveLength(
      1,
    );
    expect(shotRequestProblems({ ...open, status: 'declined' }, ids)).toHaveLength(1);
    expect(
      shotRequestProblems({ ...open, status: 'declined', answer: 'the cluster is faint' }, ids),
    ).toEqual([]);
  });
});

describe('shotRequestFileName', () => {
  it('starts with the UTC time so a listing sorts oldest first, then requester and subject', () => {
    expect(
      shotRequestFileName(
        new Date('2026-10-30T14:03:09.512Z'),
        'Home designer',
        'Virgo cluster, brighter!',
      ),
    ).toBe('20261030T140309-home-designer-virgo-cluster-brighter.json');
    expect(shotRequestFileName(new Date('2026-10-30T14:03:09Z'), '', '??')).toBe(
      '20261030T140309-anon-shot.json',
    );
  });
});
