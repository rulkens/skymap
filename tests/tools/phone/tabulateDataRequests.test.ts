import { describe, expect, it } from 'vitest';

import { tabulateDataRequests } from '../../../tools/phone/tabulateDataRequests';

describe('tabulateDataRequests', () => {
  it('groups by directory and outcome, summing bytes, and keeps the origin', () => {
    const rows = tabulateDataRequests([
      { url: 'https://10.0.0.2:4443/data/stars/a.bin', status: 200, bytes: 1000 },
      { url: 'https://10.0.0.2:4443/data/stars/b.bin?v=2', status: 200, bytes: 500 },
      { url: 'https://skymap-data.rulkens.com/data/stars/c.bin', failed: 'net::ERR_FAILED' },
      { url: 'https://10.0.0.2:4443/data/stars/d.bin', status: 404, bytes: 10 },
      {
        url: 'https://10.0.0.2:4443/data/stars/e.bin',
        status: 200,
        mimeType: 'text/html',
        bytes: 7,
      },
      { url: 'https://10.0.0.2:4443/data/manifest.json' },
    ]);
    expect(rows).toEqual([
      { dir: 'https://10.0.0.2:4443/data/stars/', outcome: '200', count: 2, bytes: 1500 },
      {
        dir: 'https://skymap-data.rulkens.com/data/stars/',
        outcome: 'FAILED net::ERR_FAILED',
        count: 1,
        bytes: 0,
      },
      { dir: 'https://10.0.0.2:4443/data/stars/', outcome: '404', count: 1, bytes: 10 },
      { dir: 'https://10.0.0.2:4443/data/stars/', outcome: '200 text/html', count: 1, bytes: 7 },
      { dir: 'https://10.0.0.2:4443/data/', outcome: 'pending', count: 1, bytes: 0 },
    ]);
  });

  it('skips requests outside /data/, including a /data/ that only appears in the query', () => {
    const rows = tabulateDataRequests([
      { url: 'https://10.0.0.2:4443/assets/index.js', status: 200, bytes: 9 },
      { url: 'https://10.0.0.2:4443/api?next=/data/x.bin', status: 200, bytes: 9 },
    ]);
    expect(rows).toEqual([]);
  });
});
