/*
 * Dev only, for the owner to judge a star-field background on real pages before one is built: `?stars=a|b|c|d`
 * turns a variant on (it stays on across pages for the tab), `?stars=off` turns it off. The stars are random
 * here, a stand-in for density and brightness only; the built field would draw the real sky.
 *   a: sparse, fixed behind the page   b: as a, in four depths that drift with the scroll at their own pace
 *   c: as b, dimmer, thinned out around words and pictures (the owner's pick)   d: half of a, barely there
 */
type Variant = { count: number; min: number; max: number; drift: boolean; clear: boolean };

const VARIANTS: Record<string, Variant> = {
  a: { count: 700, min: 0.3, max: 0.9, drift: false, clear: false },
  b: { count: 700, min: 0.3, max: 0.9, drift: true, clear: false },
  c: { count: 750, min: 0.2, max: 0.7, drift: true, clear: true },
  d: { count: 350, min: 0.22, max: 0.6, drift: false, clear: false },
};
const KEY = 'skymap:stars';
// Per 1440 × 900 CSS pixels, so a phone gets the same density as a wide screen.
const AREA = 1440 * 900;
// Four depths, faintest farthest: each layer drifts against the scroll by its own share, so near stars pass the far ones.
const DEPTHS = [0.015, 0.035, 0.065, 0.11];
const CLEARED = 'h1, h2, h3, p, li, img, video, canvas:not([data-star-preview]), a, button, figure';

const asked = new URLSearchParams(location.search).get('stars');
if (asked === 'off') sessionStorage.removeItem(KEY);
else if (asked && asked in VARIANTS) sessionStorage.setItem(KEY, asked);
const variant = VARIANTS[sessionStorage.getItem(KEY) ?? ''];

if (variant) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const tints = ['255,214,170', '190,210,255', '235,240,255', '235,240,255'];
  const stars = Array.from({ length: Math.round((variant.count * screen.width * screen.height) / AREA) }, () => {
    const b = rnd() ** 3.5;
    return { x: rnd(), y: rnd(), b, a: variant.min + b * (variant.max - variant.min), tint: tints[Math.floor(rnd() * 4)] };
  });

  const canvas = document.createElement('canvas');
  canvas.dataset.starPreview = '';
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
  document.body.prepend(canvas);
  // The body's own black would cover a canvas under it; the root keeps the black.
  document.body.style.background = 'transparent';
  const g = canvas.getContext('2d')!;

  const draw = () => {
    const dpr = devicePixelRatio;
    const w = innerWidth, h = innerHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) [canvas.width, canvas.height] = [w * dpr, h * dpr];
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    for (const s of stars) {
      const depth = DEPTHS[Math.min(DEPTHS.length - 1, Math.floor(s.b * 1.6 * DEPTHS.length))]!;
      const shift = variant.drift ? (scrollY * depth) % h : 0;
      const y = (((s.y * h - shift) % h) + h) % h;
      g.fillStyle = `rgba(${s.tint},${s.a})`;
      g.beginPath();
      g.arc(s.x * w, y, 0.5 + s.b * 0.9, 0, Math.PI * 2);
      g.fill();
    }
    if (!variant.clear) return;
    // Thin the stars out round what is read or looked at: soft-edged holes over every word and picture in view.
    g.globalCompositeOperation = 'destination-out';
    g.filter = 'blur(28px)';
    g.fillStyle = 'rgba(0,0,0,0.85)';
    for (const el of document.querySelectorAll(CLEARED)) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -40 || r.top > h + 40 || r.width === 0) continue;
      g.fillRect(r.left - 16, r.top - 12, r.width + 32, r.height + 24);
    }
    g.filter = 'none';
  };

  let queued = false;
  const redraw = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      draw();
    });
  };
  addEventListener('scroll', redraw, { passive: true });
  addEventListener('resize', redraw);
  draw();
}

// A module, so the layout can import it on demand.
export {};
