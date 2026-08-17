/**
 * renderUnsupportedPageHtml — produce the static HTML body shown to
 * visitors whose browser lacks `navigator.gpu`.
 *
 * ### Why a string-returning function rather than a JSX component
 *
 * On unsupported browsers we never want to mount React.  Doing so would
 * instantiate `useEngine` / the Redux store / the entire splash machinery
 * for a session that can't render a single frame — wasted code, wasted
 * error surfaces, and one more place where "did we forget to early-return?"
 * could bite us.  Instead, `main.tsx` checks `typeof navigator.gpu === 'undefined'`
 * synchronously *before* `createRoot`, swaps the body's innerHTML to the
 * string returned here, and bails.  React never enters the picture.
 *
 * ### Why static HTML and inline styles
 *
 * The only CSS the unsupported page needs is dark-on-light contrast and a
 * centered card.  Pulling in the design-token stylesheet would require
 * either an import-and-bundle (defeats the "React never mounts" point) or
 * a side-effect import in main.tsx that runs even on the happy path.
 * Inline styles keep the unsupported page self-contained: one function,
 * one return value, no external dependencies.
 *
 * ### Why we link to caniuse rather than enumerating support
 *
 * The WebGPU support matrix changes month to month — Safari Technology
 * Preview, Firefox Nightly, mobile Chrome rollout, etc.  Anything we
 * hard-code here ages worse than caniuse does.  The text says "use a
 * recent version of Chrome or Edge" (the safe always-true recommendation
 * today) and the link delegates the live matrix to the canonical source.
 */
export function renderUnsupportedPageHtml(): string {
  return `
<main style="
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #d8dde7;
  background: #05070d;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  margin: 0;
">
  <section style="
    max-width: 520px;
    background: rgba(8, 12, 28, 0.85);
    border: 1px solid rgba(120, 160, 240, 0.25);
    border-radius: 12px;
    padding: 32px;
    text-align: center;
  ">
    <h1 style="margin: 0 0 16px; font-size: 24px; color: #ffffff;">
      Skymap needs WebGPU
    </h1>
    <p style="margin: 0 0 16px; line-height: 1.5;">
      Your browser doesn't support WebGPU yet. Skymap renders millions of
      galaxies in 3D and needs the modern GPU API to do that smoothly.
    </p>
    <p style="margin: 0 0 24px; line-height: 1.5;">
      Try a recent version of <strong>Chrome</strong> or <strong>Edge</strong> on
      desktop, or check the live support matrix:
    </p>
    <p style="margin: 0;">
      <a
        href="https://caniuse.com/webgpu"
        style="color: #7fb5ff; text-decoration: underline;"
        rel="noopener"
      >caniuse.com/webgpu</a>
    </p>
  </section>
</main>
  `.trim();
}
