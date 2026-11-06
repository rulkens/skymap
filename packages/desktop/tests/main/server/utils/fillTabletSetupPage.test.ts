import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fillTabletSetupPage } from '../../../../src/main/server/utils/fillTabletSetupPage';

const asset = readFileSync(
  join(import.meta.dirname, '../../../../assets/tablet-setup.html'),
  'utf8',
);

describe('fillTabletSetupPage', () => {
  // A placeholder renamed on one side would leave tablets a remote link to nowhere.
  it('fills the real page so it links to the remote on the app port', () => {
    const page = fillTabletSetupPage(asset).toString();
    expect(page).toContain('https://${location.hostname}:47823`');
    expect(page).toContain('${remoteOrigin}/remote.html#${code}');
    expect(page).not.toMatch(/__[A-Z_]+__/);
  });

  it('refuses a page that lost a placeholder', () => {
    expect(() => fillTabletSetupPage('<p>no marks</p>')).toThrow('__APP_PORT__');
  });
});
