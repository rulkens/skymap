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
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'docs/screenshots/cosmic-web.png';
const OUT = 'public/og-image.jpg';
const W = 1200;
const H = 630;

// ── Text-overlay SVG ─────────────────────────────────────────────────────
//
// SVG composited as a transparent layer on top of the screenshot.  The
// black gradient at the bottom keeps the headline readable regardless of
// whatever stars happen to lie under the text in the source frame.
// Font stack picks the most distinctive sans-serif Apple ships first, then
// falls back through generic web-safe fonts; OS-level fontconfig picks
// the closest match installed on whichever machine renders this.
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
          font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Helvetica, sans-serif"
          font-size="92" font-weight="700" letter-spacing="-2" fill="#ffffff">skymap</text>
    <text x="60" y="${H - 50}"
          font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Helvetica, sans-serif"
          font-size="34" font-weight="400" fill="#a8d0ff" opacity="0.95">From Earth's surface to the edge of the observable universe</text>
    <text x="60" y="${H - 12}"
          font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Helvetica, sans-serif"
          font-size="22" font-weight="400" fill="#ffffff" opacity="0.65">SDSS · 2MRS · GLADE · Milliquas · ~3M galaxies · skymap.rulkens.com</text>
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
