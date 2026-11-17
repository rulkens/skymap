/**
 * EngravingFilter — the SVG filter that engraves a photographic thumbnail for the
 * antique look (`--thumbnail-filter: url(#antique-engrave)` in styles/antique.css).
 * Tone-width hatching: ink where darkness exceeds a hatch screen, crossed in deep
 * shadow, plus a limb line; near-black space stays bare paper, like the plate's
 * inverted sky. The output is ink as alpha, so the card's paper shows through.
 * App mounts it only while the look is on.
 */

import type { ReactNode } from 'react';
import { ANTIQUE_ENGRAVE_FILTER_ID, ENGRAVE_HATCH_PITCH } from '../../data/ui/antiqueChrome';
import { hatchTileSvg } from '../../utils/antiqueChrome/hatchTileSvg';
import { svgDataUri } from '../../utils/antiqueChrome/svgDataUri';
import styles from './EngravingFilter.module.css';

const LUMINANCE = '.2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  0 0 0 0 1';
// Body versus space by a blue-weighted sum: a sunlit ocean is dark in luminance, not in blue.
const REACH = '.3 .3 .6 0 0  .3 .3 .6 0 0  .3 .3 .6 0 0  0 0 0 0 1';
const STEP_ABOVE_EIGHTH = '0 1 1 1 1 1 1 1';
// Ink (the canvas pass's INK) with the mask as alpha.
const TO_INK = '0 0 0 0 .169  0 0 0 0 .129  0 0 0 0 .094  1 0 0 0 0';

const TILE = svgDataUri(hatchTileSvg(ENGRAVE_HATCH_PITCH, false));
const TILE_ANTI = svgDataUri(hatchTileSvg(ENGRAVE_HATCH_PITCH, true));

function EngravingFilter(): ReactNode {
  const p = ENGRAVE_HATCH_PITCH;
  return (
    <svg className={styles.root} width="0" height="0" aria-hidden focusable="false">
      <filter
        id={ANTIQUE_ENGRAVE_FILTER_ID}
        x="0"
        y="0"
        width="1"
        height="1"
        colorInterpolationFilters="sRGB"
      >
        <feColorMatrix in="SourceGraphic" type="matrix" values={LUMINANCE} result="lum" />
        <feColorMatrix in="SourceGraphic" type="matrix" values={REACH} result="reach" />
        <feComponentTransfer in="reach" result="body0">
          <feFuncR type="discrete" tableValues={STEP_ABOVE_EIGHTH} />
          <feFuncG type="discrete" tableValues={STEP_ABOVE_EIGHTH} />
          <feFuncB type="discrete" tableValues={STEP_ABOVE_EIGHTH} />
        </feComponentTransfer>
        {/* Opening (erode, dilate) drops stars and noise from the body mask; dilate minus mask is the limb. */}
        <feMorphology in="body0" operator="erode" radius="2.5" result="bodyE" />
        <feMorphology in="bodyE" operator="dilate" radius="2.5" result="body" />
        <feMorphology in="body" operator="dilate" radius="1" result="bodyD" />
        <feComponentTransfer in="body" result="space">
          <feFuncR type="table" tableValues="1 0" />
          <feFuncG type="table" tableValues="1 0" />
          <feFuncB type="table" tableValues="1 0" />
        </feComponentTransfer>
        {/* bodyD + space − 1 = bodyD − body, written so the alpha stays 1. */}
        <feComposite in="bodyD" in2="space" operator="arithmetic" k2="1" k3="1" k4="-1" result="limb" />
        <feComponentTransfer in="lum" result="lift">
          <feFuncR type="gamma" exponent=".45" />
          <feFuncG type="gamma" exponent=".45" />
          <feFuncB type="gamma" exponent=".45" />
        </feComponentTransfer>
        <feComponentTransfer in="lift" result="dark">
          <feFuncR type="linear" slope="-1.4" intercept="1.05" />
          <feFuncG type="linear" slope="-1.4" intercept="1.05" />
          <feFuncB type="linear" slope="-1.4" intercept="1.05" />
        </feComponentTransfer>
        <feImage href={TILE} x="0" y="0" width={p} height={p} preserveAspectRatio="none" result="ta" />
        <feTile in="ta" result="sa" />
        <feImage href={TILE_ANTI} x="0" y="0" width={p} height={p} preserveAspectRatio="none" result="tb" />
        <feTile in="tb" result="sb" />
        <feComposite in="dark" in2="sa" operator="arithmetic" k2="1" k3="1" k4="-0.5" result="h1" />
        <feComposite in="dark" in2="sb" operator="arithmetic" k2="1" k3="1" k4="-1.12" result="h2" />
        <feBlend in="h1" in2="h2" mode="lighten" result="h" />
        <feComponentTransfer in="h" result="hm">
          <feFuncR type="discrete" tableValues="0 1" />
          <feFuncG type="discrete" tableValues="0 1" />
          <feFuncB type="discrete" tableValues="0 1" />
        </feComponentTransfer>
        <feComposite in="hm" in2="body" operator="arithmetic" k1="1" result="hatched" />
        <feBlend in="hatched" in2="limb" mode="lighten" result="ink" />
        <feColorMatrix in="ink" type="matrix" values={TO_INK} />
      </filter>
    </svg>
  );
}

export default EngravingFilter;
