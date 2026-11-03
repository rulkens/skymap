import { describe, expect, it } from 'vitest';

import { shownLink } from '../../../packages/website/src/utils/shownLink.ts';

describe('shownLink', () => {
  it('leaves out the pose wherever it stands, behind one ellipsis', () => {
    expect(shownLink('focus=body-saturn&pose=a,0,0,0,3.75&t=2026-10-07T12:00:00Z')).toBe(
      'focus=body-saturn&t=2026-10-07T12:00:00Z&…',
    );
  });

  it('prints a link without a pose as it is', () => {
    expect(shownLink('focus=body-saturn')).toBe('focus=body-saturn');
  });
});
