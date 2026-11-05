import { describe, expect, it } from 'vitest';

import { tableCells } from '../../../packages/website/src/utils/tableCells';

describe('tableCells', () => {
  it('reads the heading row and each body row, markup inside a cell kept', () => {
    const html = `<thead><tr><th></th><th align="left">What it does</th></tr></thead>
      <tbody><tr><td><span class="keys"><kbd>Shift</kbd> + <kbd>N</kbd></span></td><td>Back to <a href="/x/">now</a></td></tr>
      <tr><td style="text-align:left"><code>t=2020</code></td><td></td></tr></tbody>`;
    expect(tableCells(html)).toEqual({
      head: ['', 'What it does'],
      rows: [
        [
          '<span class="keys"><kbd>Shift</kbd> + <kbd>N</kbd></span>',
          'Back to <a href="/x/">now</a>',
        ],
        ['<code>t=2020</code>', ''],
      ],
    });
  });
});
