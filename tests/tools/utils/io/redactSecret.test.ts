import { describe, it, expect } from 'vitest';
import { redactSecret } from '../../../../tools/utils/io/redactSecret';

describe('redactSecret', () => {
  it('removes the key from a URL and from a wrapped error message', () => {
    const secret = 'sk-super-secret-1234';
    const url = `https://api.datafordeler.dk/FileDownloads/GetPointCloudFile?FileName=x.las&apiKey=${secret}`;
    const wrapped = new Error(`download failed: HTTP 500 for ${url}`).message;

    expect(redactSecret(url, secret)).toBe(
      'https://api.datafordeler.dk/FileDownloads/GetPointCloudFile?FileName=x.las&apiKey=<redacted>',
    );
    expect(redactSecret(wrapped, secret)).toBe(
      'download failed: HTTP 500 for https://api.datafordeler.dk/FileDownloads/GetPointCloudFile?FileName=x.las&apiKey=<redacted>',
    );
    expect(redactSecret(wrapped, secret)).not.toContain(secret);
  });
});
