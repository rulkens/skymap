/**
 * Tests for TierSelector — three-button segmented control at the top of the
 * Settings panel.
 *
 * vitest runs in node env (no DOM lib).  We test the static-render branches
 * via renderToStaticMarkup, mirroring the CollapsibleSection test pattern.
 * Click handling is verified manually against the dev server.
 */

import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TierSelector } from '../../../src/components/SettingsPanel/TierSelector';

describe('TierSelector', () => {
  it('renders all three tier labels', () => {
    const html = renderToStaticMarkup(
      createElement(TierSelector, { tier: 'medium', onTierChange: vi.fn() }),
    );
    expect(html).toContain('Small');
    expect(html).toContain('Medium');
    expect(html).toContain('Large');
  });

  it('marks the currently-selected tier as pressed (aria-pressed=true)', () => {
    const html = renderToStaticMarkup(
      createElement(TierSelector, { tier: 'large', onTierChange: vi.fn() }),
    );
    // Three buttons; only one with aria-pressed="true".
    const trueMatches = html.match(/aria-pressed="true"/g) ?? [];
    expect(trueMatches.length).toBe(1);
    // The "true" pressed button must be the Large one — we encode this by
    // putting `data-tier="<value>"` on each button.
    expect(html).toMatch(/data-tier="large"[^>]*aria-pressed="true"/);
  });

  it('renders Small as pressed when tier=small', () => {
    const html = renderToStaticMarkup(
      createElement(TierSelector, { tier: 'small', onTierChange: vi.fn() }),
    );
    expect(html).toMatch(/data-tier="small"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-tier="medium"[^>]*aria-pressed="false"/);
    expect(html).toMatch(/data-tier="large"[^>]*aria-pressed="false"/);
  });
});
