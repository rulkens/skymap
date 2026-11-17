import { describe, it, expect, vi } from 'vitest';
import { Project } from 'ts-morph';
import { removeFileWithMirror } from '../../../../tools/utils/refactor/removeFileWithMirror';

describe('removeFileWithMirror', () => {
  it.each([
    ['/', 'src/foo.ts', 'tests/foo.test.ts'],
    ['/home/me/tools/skymap', 'src/foo.ts', 'tests/foo.test.ts'],
    ['/home/me/src/skymap', 'tools/foo.ts', 'tests/tools/foo.test.ts'],
  ])('takes the mirror along, in a checkout at %s', (root, src, test) => {
    const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
    vi.spyOn(project.getFileSystem(), 'getCurrentDirectory').mockReturnValue(root);
    const source = project.createSourceFile(`${root}/${src}`.replace('//', '/'), '');
    project.createSourceFile(`${root}/${test}`.replace('//', '/'), '');
    const other = project.createSourceFile(`${root}/other.ts`.replace('//', '/'), '');

    removeFileWithMirror(project, source);

    expect(project.getSourceFiles()).toEqual([other]);
  });
});
