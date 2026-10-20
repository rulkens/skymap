/**
 * The review bar writes a page's job into the front matter of its text. A write that touched another
 * line, or a `job:` in the body, would be an edit nobody asked for in a file the owner is also editing.
 */
import { describe, expect, it } from 'vitest';

import { setFrontMatterJob } from '../../../tools/site/utils/setFrontMatterJob';

const page = [
  '---',
  'title: What is in the scene',
  'description: Everything Skymap draws.',
  'job: "Old question?"',
  'facts:',
  '  [',
  '    geodanmark-orthophoto,',
  '    sci-earth-clouds,',
  '  ]',
  '---',
  '',
  'Body.',
].join('\n');

describe('setFrontMatterJob', () => {
  it('replaces the job line and leaves every other line as it was', () => {
    const before = page.split('\n');
    const after = setFrontMatterJob(page, 'New question?').split('\n');
    expect(after).toHaveLength(before.length);
    const changed = after.flatMap((line, i) => (line === before[i] ? [] : [i]));
    expect(changed).toEqual([3]);
    expect(after[3]).toBe('job: "New question?"');
  });

  it('adds a job line at the end of the front matter when the page has none', () => {
    const bare = ['---', 'title: Features', 'description: All of it.', '---', 'Body.'].join('\n');
    expect(setFrontMatterJob(bare, 'What?')).toBe(
      ['---', 'title: Features', 'description: All of it.', 'job: "What?"', '---', 'Body.'].join(
        '\n',
      ),
    );
  });

  it('writes the job JSON-quoted, so a colon or a quote stays one string', () => {
    expect(setFrontMatterJob(page, 'Where: "here"')).toContain('\njob: "Where: \\"here\\""\n');
  });

  it('leaves a job: line in the body alone', () => {
    const text = ['---', 'title: A', '---', 'job: in the body'].join('\n');
    const out = setFrontMatterJob(text, 'Q');
    expect(out.endsWith('\n---\njob: in the body')).toBe(true);
    expect(out).toContain('\njob: "Q"\n---');
  });

  it('refuses a job that runs over several lines', () => {
    const folded = ['---', 'title: A', 'job: >', '  A question', '  over two lines', '---'].join(
      '\n',
    );
    expect(() => setFrontMatterJob(folded, 'Q')).toThrow(/several lines/);
    const wrapped = ['---', 'title: A', 'job: A question', '  that goes on', '---'].join('\n');
    expect(() => setFrontMatterJob(wrapped, 'Q')).toThrow(/several lines/);
  });

  it('refuses a file with no front matter', () => {
    expect(() => setFrontMatterJob('Body only.\n', 'Q')).toThrow(/front matter/);
  });
});
