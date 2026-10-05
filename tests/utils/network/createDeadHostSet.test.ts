/**
 * createDeadHostSet — the session-scoped "this host stopped answering" memory.
 *
 * The streak must be CONSECUTIVE: a host that answers between failures is
 * working, and counting non-consecutive timeouts would eventually retire a
 * healthy host over a long session. Recovery is deliberately absent — once
 * retired, a host stays skipped until reload.
 */

import { describe, it, expect } from 'vitest';
import { createDeadHostSet } from '../../../src/utils/network/createDeadHostSet';

const SDSS = 'https://skyserver.sdss.org/dr18/SkyServerWS/ImgCutout/getjpeg?ra=1&dec=2';
const ALASKY = 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits?ra=1&dec=2';

describe('createDeadHostSet', () => {
  it('retires a host only after the full consecutive-failure streak', () => {
    const dead = createDeadHostSet();
    expect(dead.isDead(ALASKY)).toBe(false);

    dead.note(ALASKY, false);
    dead.note(ALASKY, false);
    expect(dead.isDead(ALASKY)).toBe(false); // still under the streak

    dead.note(ALASKY, false);
    expect(dead.isDead(ALASKY)).toBe(true);
  });

  it('clears the streak on any answer, so transient failures never retire a host', () => {
    const dead = createDeadHostSet();
    dead.note(ALASKY, false);
    dead.note(ALASKY, false);
    dead.note(ALASKY, true); // answered — host is alive
    dead.note(ALASKY, false);
    dead.note(ALASKY, false);
    expect(dead.isDead(ALASKY)).toBe(false);
  });

  it('tracks hosts independently, so one outage does not retire the other source', () => {
    const dead = createDeadHostSet();
    for (let i = 0; i < 3; i += 1) dead.note(ALASKY, false);
    expect(dead.isDead(ALASKY)).toBe(true);
    expect(dead.isDead(SDSS)).toBe(false);
  });

  it('stays retired — no cooldown, no half-open probe', () => {
    const dead = createDeadHostSet();
    for (let i = 0; i < 3; i += 1) dead.note(ALASKY, false);
    dead.note(ALASKY, true); // even a success cannot bring it back
    expect(dead.isDead(ALASKY)).toBe(true);
  });

  it('ignores an unparseable URL rather than throwing into the fetch path', () => {
    const dead = createDeadHostSet();
    expect(() => dead.note('not a url', false)).not.toThrow();
    expect(dead.isDead('not a url')).toBe(false);
  });
});
