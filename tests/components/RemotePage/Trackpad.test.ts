import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// jsdom has no layout, so the stylesheet is the only place the browser-stealing-the-drag
// landmine can be pinned: without touch-action none a phone fires pointercancel after one move.
describe('Trackpad stylesheet', () => {
  it('the trackpad stylesheet sets touch-action none', () => {
    const css = readFileSync('src/components/RemotePage/Trackpad/Trackpad.module.css', 'utf8');
    expect(css).toMatch(/\.pad\s*\{[^}]*touch-action:\s*none/);
  });
});
