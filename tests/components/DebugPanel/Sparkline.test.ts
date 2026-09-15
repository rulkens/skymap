// @vitest-environment jsdom
/**
 * Sparkline — render coverage for the 8-level unicode block sparkline.
 *
 * Five scenarios:
 *   1. Empty samples → empty string.
 *   2. Single sample → single character (necessarily the top block, since
 *      the lone sample is 100% of `max(samples)`).
 *   3. All-zero samples → all `▁` (the lowest block) — distinguishes
 *      "no signal" from "no samples".
 *   4. Monotonic ramp 0..7 → exact mapping to `▁▂▃▄▅▆▇█`.
 *   5. Non-uniform samples normalise against `max(samples)` correctly.
 *
 * The test file lives under `tests/components/DebugPanel/` to mirror the
 * planned `src/components/DebugPanel/Sparkline.tsx` location.  We use
 * `.test.ts` + `createElement` (not `.test.tsx` + JSX) to match the
 * project-wide vitest convention — `vitest.config.ts` `include` is
 * scoped to `*.test.ts` files only.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { Sparkline } from '../../../src/components/DebugPanel/Sparkline';

describe('Sparkline', () => {
  it('renders nothing for an empty samples array', () => {
    const { container } = render(createElement(Sparkline, { samples: [] }));
    expect(container.textContent).toBe('');
  });

  it('renders the canonical 8-level ramp when samples are 0..7', () => {
    const { container } = render(createElement(Sparkline, { samples: [0, 1, 2, 3, 4, 5, 6, 7] }));
    expect(container.textContent).toBe('▁▂▃▄▅▆▇█');
  });
});
