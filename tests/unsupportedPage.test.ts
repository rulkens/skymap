import { describe, it, expect } from 'vitest';
import { renderUnsupportedPageHtml } from '../src/unsupportedPage';

describe('renderUnsupportedPageHtml', () => {
  it('mentions WebGPU and a supported-browser recommendation', () => {
    const html = renderUnsupportedPageHtml();
    expect(html).toMatch(/WebGPU/i);
    expect(html.toLowerCase()).toMatch(/chrome|edge/);
  });

  it('links to the caniuse WebGPU page so users can self-diagnose', () => {
    const html = renderUnsupportedPageHtml();
    expect(html).toContain('https://caniuse.com/webgpu');
  });
});
