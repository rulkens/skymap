/**
 * Generate `public/og-image.jpg` — the social-card preview image embedded
 * via `<meta property="og:image">`.
 *
 * Constraints we're solving for:
 *
 *   1. **WhatsApp's 600 KB cap.**  Larger images get silently dropped on
 *      mobile WhatsApp link previews — the most common chat platform a
 *      shared URL lands in.  JPEG at quality 85 lands well under that.
 *   2. **Facebook / Twitter optimum 1200×630.**  Some validators warn on
 *      other aspect ratios; many crawlers pad / crop oddly.  Anchor on
 *      1200×630 and we satisfy every renderer.
 *   3. **Legible at thumbnail size.**  Most OG renders are ~200 px wide.
 *      A naked screenshot reads as a blue blob; overlaying a brief
 *      headline ("Skymap" + tagline) makes the card identifiable in a
 *      cramped link preview.
 *
 * Pipeline: take `docs/screenshots/cosmic-web.png` (the supercluster-scale
 * view), centre-crop to 1200×630, composite a bottom-anchored dark
 * gradient + an SVG text layer, encode as quality-85 JPEG.  Output is
 * committed so deploys don't depend on the script running in CI.  Re-run
 * via `npx tsx tools/makeOgImage.ts` whenever the source screenshot or
 * the headline copy changes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// librsvg resolves SVG font names through fontconfig, which knows nothing of
// the app's Google-hosted webfont. Point it at the repo-local Cormorant TTF
// (plus the system dirs, so Menlo still resolves) via FONTCONFIG_FILE — which
// must be set BEFORE libvips initialises, hence the dynamic sharp import.
const fontDir = join(dirname(fileURLToPath(import.meta.url)), 'fonts');
const confDir = join(tmpdir(), 'skymap-og-fontconfig');
mkdirSync(confDir, { recursive: true });
const confPath = join(confDir, 'fonts.conf');
writeFileSync(
  confPath,
  `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>
  <dir>${fontDir}</dir>
  <dir>/System/Library/Fonts</dir>
  <dir>/Library/Fonts</dir>
  <dir>/usr/share/fonts</dir>
  <cachedir>${confDir}/cache</cachedir>
</fontconfig>`,
);
process.env.FONTCONFIG_FILE = confPath;
const sharp = (await import('sharp')).default;

const SRC = 'docs/screenshots/cosmic-web.png';
const OUT = 'public/og-image.jpg';
const W = 1200;
const H = 630;

// ── Text-overlay SVG ─────────────────────────────────────────────────────
//
// SVG composited as a transparent layer on top of the screenshot.  The
// black gradient at the bottom keeps the headline readable regardless of
// whatever stars happen to lie under the text in the source frame.
// Faces mirror the app: Cormorant Garamond SemiBold (the display serif baked
// into the label atlas) for the wordmark, the mono stack for everything else.
const overlay = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="dark" x1="0" y1="${H * 0.35}" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#dark)"/>
    <text x="60" y="${H - 100}"
          font-family="'Cormorant Garamond', serif"
          font-size="104" font-weight="600" fill="#ffffff">skymap</text>
    <text x="60" y="${H - 50}"
          font-family="Menlo, monospace"
          font-size="28" font-weight="400" fill="#a8d0ff" opacity="0.95">From Earth's surface to the edge of the observable universe</text>
    <text x="60" y="${H - 12}"
          font-family="Menlo, monospace"
          font-size="20" font-weight="400" fill="#ffffff" opacity="0.65">3M galaxies · 16.8M stars · planets · the cosmic web · skymap.rulkens.com</text>
  </svg>`,
);

const src = readFileSync(SRC);

// `cover` resizes so the image fills 1200×630 and the centre is preserved
// (cropping equally from any over-long sides).  The 16:9 source is a touch
// wider than 1200:630, so a thin slice comes off the left and right edges —
// picture stays composed as it looked in the screenshot.
const buf = await sharp(src)
  .resize(W, H, { fit: 'cover', position: 'centre' })
  .composite([{ input: overlay, top: 0, left: 0 }])
  .jpeg({ quality: 85, mozjpeg: true })
  .toBuffer();
writeFileSync(OUT, buf);
console.log(`wrote ${(buf.length / 1024).toFixed(1)} KB to ${OUT}`);
