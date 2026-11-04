import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppPath } from '../../../src/main/server/resolveAppPath';

const roots = { dist: resolve('/app/dist'), data: resolve('/app/data'), caPem: 'PEM' };

describe('resolveAppPath', () => {
  it('routes /data/ to the data root', () => {
    expect(resolveAppPath('/data/galaxy/a.bin', roots)).toBe(join(roots.data, 'galaxy/a.bin'));
    expect(resolveAppPath('/data/manifest.json?v=2', roots)).toBe(
      join(roots.data, 'manifest.json'),
    );
  });

  it('routes other paths to dist and / to index.html', () => {
    expect(resolveAppPath('/', roots)).toBe(join(roots.dist, 'index.html'));
    expect(resolveAppPath('/?dome&remote', roots)).toBe(join(roots.dist, 'index.html'));
    expect(resolveAppPath('/assets/main.js', roots)).toBe(join(roots.dist, 'assets/main.js'));
    expect(resolveAppPath('/remote.html', roots)).toBe(join(roots.dist, 'remote.html'));
  });

  it('serves /ca.crt', () => {
    expect(resolveAppPath('/ca.crt', roots)).toBe('ca');
  });

  it('refuses ../ traversal', () => {
    expect(resolveAppPath('/../secret', roots)).toBeNull();
    expect(resolveAppPath('/assets/../../secret', roots)).toBeNull();
    expect(resolveAppPath('//etc/passwd', roots)).toBeNull();
    expect(resolveAppPath('/data//etc/passwd', roots)).toBeNull();
  });

  it('refuses percent-encoded traversal', () => {
    expect(resolveAppPath('/%2e%2e/secret', roots)).toBeNull();
    expect(resolveAppPath('/data/%2E%2E/%2e%2e/secret', roots)).toBeNull();
    expect(resolveAppPath('/data/..%2fsecret', roots)).toBeNull();
    expect(resolveAppPath('/%2fetc/passwd', roots)).toBeNull();
    expect(resolveAppPath('/bad%zz', roots)).toBeNull();
  });

  it('refuses backslash traversal', () => {
    expect(resolveAppPath('/..\\secret', roots)).toBeNull();
    expect(resolveAppPath('/data/..%5c..%5csecret', roots)).toBeNull();
    expect(resolveAppPath('/data/C:%5cWindows', roots)).toBeNull();
  });

  it('refuses traversal from /data/ into dist', () => {
    expect(resolveAppPath('/data/../index.html', roots)).toBeNull();
    expect(resolveAppPath('/data/%2e%2e/index.html', roots)).toBeNull();
    expect(resolveAppPath('/data/', roots)).toBeNull();
  });
});
