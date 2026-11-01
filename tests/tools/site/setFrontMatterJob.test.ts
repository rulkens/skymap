/**
 * The review bar writes a page's job into the front matter of its text; the line rules are
 * setStructureJob's. What is tested here is the fence: the body is never read or changed.
 */
import { describe, expect, it } from 'vitest';

import { setFrontMatterJob } from '../../../tools/site/utils/setFrontMatterJob';

const page = [
  '---',
  'title: What is in the scene',
  'job: "Old question?"',
  'facts:',
  '  [',
  '    geodanmark-orthophoto,',
  '  ]',
  '---',
  '',
  'job: in the body',
].join('\n');

describe('setFrontMatterJob', () => {
  it('replaces the job line in the front matter and leaves every other line, the body included, as it was', () => {
    const before = page.split('\n');
    const after = setFrontMatterJob(page, 'New question?').split('\n');
    expect(after).toHaveLength(before.length);
    const changed = after.flatMap((line, i) => (line === before[i] ? [] : [i]));
    expect(changed).toEqual([2]);
    expect(after[2]).toBe('job: "New question?"');
  });

  it('does not take a job: line in the body for the page job', () => {
    const noJob = ['---', 'title: A', '---', 'job: in the body'].join('\n');
    expect(() => setFrontMatterJob(noJob, 'Q')).toThrow(/No job line/);
  });

  it('refuses a file with no front matter', () => {
    expect(() => setFrontMatterJob('Body only.\n', 'Q')).toThrow(/front matter/);
  });
});
