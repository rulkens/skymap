/**
 * The review bar writes a page's job into its structure file or front matter. A write that touched
 * another line, or a section's own `job:`, would be an edit nobody asked for in a file the owner is
 * also editing.
 */
import { describe, expect, it } from 'vitest';

import { setStructureJob } from '../../../tools/site/utils/setStructureJob';

const file = [
  'job: "Old question?"',
  '# sections follow',
  'sections:',
  '  - heading: Flight',
  '    job: "What is the flight?"',
  '    parts:',
  '      - heading: Start',
  '        job: Where it begins',
].join('\n');

describe('setStructureJob', () => {
  it('replaces the top-level job line and leaves every other line as it was', () => {
    const before = file.split('\n');
    const after = setStructureJob(file, 'New question?').split('\n');
    expect(after).toHaveLength(before.length);
    const changed = after.flatMap((line, i) => (line === before[i] ? [] : [i]));
    expect(changed).toEqual([0]);
    expect(after[0]).toBe('job: "New question?"');
  });

  it('never reads a section job as the page job', () => {
    const bare = file.split('\n').slice(1).join('\n');
    expect(() => setStructureJob(bare, 'What?')).toThrow(/No job line/);
  });

  it('writes the job JSON-quoted, so a colon or a quote stays one string', () => {
    expect(setStructureJob(file, 'Where: "here"').startsWith('job: "Where: \\"here\\""\n')).toBe(
      true,
    );
  });

  it('refuses a job that runs over several lines', () => {
    expect(() =>
      setStructureJob('job: >\n  A question\n  over two lines\nsections: []', 'Q'),
    ).toThrow(/several lines/);
    expect(() => setStructureJob('job: A question\n  that goes on\nsections: []', 'Q')).toThrow(
      /several lines/,
    );
  });
});
