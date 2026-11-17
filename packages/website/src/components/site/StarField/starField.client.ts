/*
 * The real naked-eye sky behind every page, baked by tools/site/buildStarField.ts: a band round the great circle
 * through the poles and Orion's belt, Orion in the middle of each page's first screen, north up, south down the page.
 * Scrolling moves the viewer twice: the view turns south along the band (`TURN`, the same for every star) and steps
 * sideways through space, which shifts each distance layer by `STEP` × the nearest layer's distance / its own. That
 * 1/distance is the true law of parallax, scaled up enormously, so near stars truly pass the far ones.
 * Stars thin out round words and pictures and stay off [data-starless] films. Those boxes are measured when the page
 * changes (resize, new content, fonts), never per frame; a frame reads only the scroll position.
 */
import fieldUrl from '../../../assets/starField.bin?url';
import type { StarField } from '../../../@types/StarField';
import { decodeStarField } from '../../../utils/decodeStarField.ts';
import { lessWanted } from '../../../utils/lessWanted.ts';

const TURN = 0.015;
const STEP = 0.095;
// About 90° of sky across a wide screen; a phone keeps 12 px a degree, so its stars are not crowded.
const DEG_ACROSS = 90;
const MIN_PX_PER_DEG = 12;
// Sirius (Hp −1.1) gets the top of each range, the faintest stars baked (Hp 6) the bottom. Radii in CSS px.
const MAG_BRIGHT = -1;
const MAG_FAINT = 6;
const ALPHA = [0.3, 1] as const;
const RADIUS = [0.7, 3.2] as const;
// A star is solid to about its RADIUS, then a dim halo runs out to RADIUS / CORE, so the brightest few glow.
const CORE = 0.4;
const CLEARED =
  'h1, h2, h3, h4, p, li, dt, dd, th, td, blockquote, figcaption, pre, img, picture, video, canvas, svg, a, button, input, textarea, select, label, figure, [data-starless]';
// A star fades from nothing at PAD px from a box to full at PAD + FEATHER.
const PAD = 6;
const FEATHER = 56;
const FAR = (PAD + FEATHER) ** 2;

function mount(field: StarField) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    // A canvas keeps its own 300 × 150 under insets alone, so its size is set too.
    top: 'var(--nav-height)',
    left: '0',
    width: '100%',
    height: 'calc(100% - var(--nav-height))',
    zIndex: '-1',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity var(--duration-reveal) var(--ease-enter)',
  });
  document.body.prepend(canvas);
  const g = canvas.getContext('2d')!;

  const motion = !lessWanted().motion;
  const near = field.layers[0]!.distancePc;
  const rates = field.layers.map((layer) => (motion ? TURN + (STEP * near) / layer.distancePc : 0));
  const sprites = field.palette.map(sprite);
  const n = field.mag.length;
  const alpha = new Float32Array(n);
  const radius = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, Math.max(0, (MAG_FAINT - field.mag[i]!) / (MAG_FAINT - MAG_BRIGHT)));
    alpha[i] = ALPHA[0] + (ALPHA[1] - ALPHA[0]) * t;
    radius[i] = RADIUS[0] + (RADIUS[1] - RADIUS[0]) * t ** 2.5;
  }

  // Cleared boxes in page coordinates, four numbers each; the canvas's own place on the screen.
  let boxes = new Float64Array(0);
  let top = 0;
  let width = 0;
  let height = 0;
  let last = '';

  const measure = () => {
    const out: number[] = [];
    const scroll = scrollY;
    const pinnedBy = new Map<Element, Element | null | false>();
    for (const el of document.querySelectorAll(CLEARED)) {
      // The bar is opaque and the canvas starts below it.
      if (el === canvas || el.parentElement?.closest(CLEARED) || el.closest('body > header')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const pin = pinnedAncestor(el, pinnedBy);
      if (pin === false) continue;
      // A sticky box slides inside its parent as the page scrolls: clear the whole run it can slide along.
      const run = pin ? pin.parentElement!.getBoundingClientRect() : r;
      out.push(r.left, run.top + scroll, r.right, run.bottom + scroll);
    }
    boxes = Float64Array.from(out);
    const place = canvas.getBoundingClientRect();
    top = place.top;
    width = place.width;
    height = place.height;
    last = '';
    queue();
  };

  const draw = () => {
    const scroll = scrollY;
    const key = `${scroll} ${width} ${height}`;
    if (key === last) return;
    last = key;
    const dpr = Math.min(devicePixelRatio, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);

    // The boxes near the canvas now, in its coordinates.
    const around: number[] = [];
    const shift = scroll + top;
    for (let k = 0; k < boxes.length; k += 4) {
      const t = boxes[k + 1]! - shift;
      const b = boxes[k + 3]! - shift;
      if (b > -PAD - FEATHER && t < height + PAD + FEATHER) around.push(boxes[k]!, t, boxes[k + 2]!, b);
    }

    const scale = Math.max(MIN_PX_PER_DEG, width / DEG_ACROSS);
    const loop = 360 * scale;
    const cx = width / 2;
    const cy = height / 2;
    let start = 0;
    field.layers.forEach((layer, l) => {
      const offset = scroll * rates[l]!;
      for (let i = start; i < layer.end; i++) {
        const r = radius[i]! / CORE;
        const x = cx - field.across[i]! * scale;
        if (x < -r || x > width + r) continue;
        let y = (field.along[i]! * scale - offset + cy) % loop;
        if (y < 0) y += loop;
        if (y > height + r) y -= loop;
        if (y < -r || y > height + r) continue;
        const fade = clearance(x, y, around);
        if (fade === 0) continue;
        g.globalAlpha = alpha[i]! * fade;
        g.drawImage(sprites[field.tint[i]!]!, x - r, y - r, 2 * r, 2 * r);
      }
      start = layer.end;
    });
    canvas.style.opacity = '1';
  };

  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      draw();
    });
  };
  let pending = 0;
  const remeasure = () => {
    if (pending) return;
    pending = window.setTimeout(() => {
      pending = 0;
      measure();
    }, 150);
  };

  addEventListener('scroll', queue, { passive: true });
  new ResizeObserver(remeasure).observe(document.body);
  addEventListener('resize', remeasure);
  new MutationObserver(remeasure).observe(document.querySelector('main') ?? document.body, {
    childList: true,
    subtree: true,
  });
  void document.fonts.ready.then(remeasure);
  measure();
}

/** The sticky element `el` rides in, null when none, false when it sits in a fixed layer over the page. */
function pinnedAncestor(el: Element, memo: Map<Element, Element | null | false>): Element | null | false {
  const seen: Element[] = [];
  let found: Element | null | false = null;
  for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
    const known = memo.get(a);
    if (known !== undefined) {
      found = known;
      break;
    }
    seen.push(a);
    const position = getComputedStyle(a).position;
    if (position === 'fixed') found = false;
    else if (position === 'sticky') found = a;
    else continue;
    break;
  }
  for (const a of seen) memo.set(a, found);
  return found;
}

/** How much of a star at (x, y) stays: 0 within PAD of a box, rising smoothly to 1 at PAD + FEATHER. */
function clearance(x: number, y: number, near: readonly number[]): number {
  let fade = 1;
  for (let k = 0; k < near.length; k += 4) {
    const dx = Math.max(near[k]! - x, 0, x - near[k + 2]!);
    const dy = Math.max(near[k + 1]! - y, 0, y - near[k + 3]!);
    const d2 = dx * dx + dy * dy;
    if (d2 >= FAR) continue;
    const t = Math.max(0, Math.sqrt(d2) - PAD) / FEATHER;
    fade = Math.min(fade, t * t * (3 - 2 * t));
    if (fade === 0) return 0;
  }
  return fade;
}

/** A soft round star in one colour, drawn at any size. */
function sprite(colour: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const glow = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, colour);
  glow.addColorStop(CORE * 0.75, colour);
  glow.addColorStop(CORE * 1.25, `${colour}40`);
  glow.addColorStop(1, `${colour}00`);
  g.fillStyle = glow;
  g.fillRect(0, 0, 32, 32);
  return c;
}

const start = () => {
  fetch(fieldUrl, { priority: 'low' })
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(response.status)))
    .then((buffer) => mount(decodeStarField(buffer)))
    // The sky is decoration: without it the page is its plain black.
    .catch(() => {});
};
const whenIdle = () =>
  'requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 2000 }) : setTimeout(start, 200);
if (document.readyState === 'complete') whenIdle();
else addEventListener('load', whenIdle, { once: true });
