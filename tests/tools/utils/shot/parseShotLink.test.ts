import { describe, it, expect } from 'vitest';

import { parseShotLink } from '../../../../tools/utils/shot/parseShotLink';

describe('parseShotLink', () => {
  it('full URL keeps query and hash, drops origin and path', () => {
    expect(parseShotLink('https://skymap.example/app/?dome#focus=body-saturn&t=1')).toEqual({
      search: 'dome',
      hash: 'focus=body-saturn&t=1',
    });
  });
  it('bare hash body', () => {
    expect(parseShotLink('focus=body-saturn')).toEqual({ search: '', hash: 'focus=body-saturn' });
  });
  it('leading #', () => {
    expect(parseShotLink('#focus=body-saturn')).toEqual({ search: '', hash: 'focus=body-saturn' });
  });
  it('leading ? with a hash', () => {
    expect(parseShotLink('?dome#focus=body-saturn')).toEqual({
      search: 'dome',
      hash: 'focus=body-saturn',
    });
  });
  it('URL with no hash', () => {
    expect(parseShotLink('http://localhost:5173/?dome')).toEqual({ search: 'dome', hash: '' });
  });
});
