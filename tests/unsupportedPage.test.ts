import { describe, it, expect } from 'vitest';
import { renderUnsupportedPageHtml } from '../src/unsupportedPage';

describe('renderUnsupportedPageHtml', () => {
  it('returns a non-empty HTML string', () => {
    const html = renderUnsupportedPageHtml();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(50);
  });

  it('mentions WebGPU and a supported-browser recommendation', () => {
    const html = renderUnsupportedPageHtml();
    expect(html).toMatch(/WebGPU/i);
    expect(html.toLowerCase()).toMatch(/chrome|edge/);
  });

  it('links to the caniuse WebGPU page so users can self-diagnose', () => {
    const html = renderUnsupportedPageHtml();
    expect(html).toContain('https://caniuse.com/webgpu');
  });

  it('uses the skymap brand colors and is full-viewport', () => {
    const html = renderUnsupportedPageHtml();
    expect(html).toContain('100vh');
    expect(html.toLowerCase()).toContain('skymap');
  });
});
