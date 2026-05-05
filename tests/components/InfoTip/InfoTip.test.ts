/**
 * InfoTip — server-side render smoke tests.
 *
 * The project's vitest config runs in `environment: 'node'`, so a full
 * @testing-library setup would be a heavy addition for one component.
 * `renderToStaticMarkup` from `react-dom/server` gives us the rendered
 * HTML string in pure node — enough to verify the structural contract
 * the CSS depends on (focusable trigger, role="tooltip" panel, unique
 * anchor names per instance).
 *
 * The fade-in/out, hover/focus reveals, and anchor positioning are all
 * browser-driven (CSS-only via @starting-style and `:hover` /
 * `:focus-within`), so they're verified manually in the dev browser
 * rather than asserted here.
 */

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InfoTip } from '../../../src/components/InfoTip/InfoTip';

describe('InfoTip', () => {
  it('renders the trigger as keyboard-focusable', () => {
    const html = renderToStaticMarkup(
      createElement(InfoTip, { title: 'Distance', body: 'how far' }, '542 Mpc'),
    );
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('542 Mpc');
  });

  it('links the trigger to the tooltip via aria-describedby + role="tooltip"', () => {
    const html = renderToStaticMarkup(
      createElement(InfoTip, { title: 'Distance', body: 'how far' }, '542 Mpc'),
    );
    // The aria-describedby value is the panel's id.  We don't assert
    // the literal id (it's derived from useId and changes between
    // server and client) — only that *some* describedby points at a
    // tooltip-roled element with a matching id.
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(describedBy).toBeDefined();
    expect(html).toContain(`id="${describedBy}"`);
    expect(html).toContain('role="tooltip"');
  });

  it('renders the title and body inside the panel', () => {
    const html = renderToStaticMarkup(
      createElement(
        InfoTip,
        { title: 'Distance', body: 'how far the galaxy is from us' },
        '542 Mpc',
      ),
    );
    expect(html).toContain('Distance');
    expect(html).toContain('how far the galaxy is from us');
  });

  it('gives sibling instances distinct ids and anchor names', () => {
    const html = renderToStaticMarkup(
      createElement(
        'div',
        null,
        createElement(InfoTip, { title: 'A', body: 'aa' }, 'one'),
        createElement(InfoTip, { title: 'B', body: 'bb' }, 'two'),
      ),
    );
    // Pull every aria-describedby and confirm the two values differ.
    const ids = Array.from(html.matchAll(/aria-describedby="([^"]+)"/g)).map(
      (m) => m[1],
    );
    expect(ids.length).toBe(2);
    expect(ids[0]).not.toBe(ids[1]);
    // Inline anchor-name styles on the trigger should also differ — the
    // tip's positioning depends on each trigger having its own anchor.
    const anchorNames = Array.from(
      html.matchAll(/anchor-name:--tip-([a-zA-Z0-9]+)/g),
    ).map((m) => m[1]);
    expect(anchorNames.length).toBe(2);
    expect(anchorNames[0]).not.toBe(anchorNames[1]);
  });

  it('accepts JSX bodies, not just plain strings', () => {
    const html = renderToStaticMarkup(
      createElement(
        InfoTip,
        {
          title: 'Redshift',
          body: createElement('code', null, 'z = Δλ / λ'),
        },
        'z',
      ),
    );
    expect(html).toContain('<code>z = Δλ / λ</code>');
  });
});
