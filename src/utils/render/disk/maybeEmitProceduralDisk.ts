import { smoothstep } from '../../math/smoothstep';
import type { ProceduralDiskInstance } from '../../../@types/rendering/ProceduralDiskInstance';
import type { SourceType } from '../../../@types/data/SourceType';

/**
 * Decide whether (and how) to emit a per-frame ProceduralDiskInstance.
 * Pure helper (no captured state) so the gate + smoothstep crossfade
 * are unit-testable without a planner.
 *
 * `procFadeOut` defaults to 1.0 (no fade-out against the textured-disk
 * pass). The caller in `runFrame` overrides it for famous galaxies
 * whose curated WebP is loaded into the atlas — see the famous-WebP
 * crossfade comment at the override site.
 */
export function maybeEmitProceduralDisk(
  px: number,
  ar: number,
  pa: number,
  x: number,
  y: number,
  z: number,
  sizeWorldMpc: number,
  colourIndex: number,
  sbAmp: number,
  fadeStartPx: number,
  fadeEndPx: number,
  sourceCode: SourceType,
  localIdx: number,
): ProceduralDiskInstance | null {
  if (px <= fadeStartPx) return null;
  if (!Number.isFinite(ar) || !Number.isFinite(pa)) return null;
  const crossfadeAlpha = smoothstep(fadeStartPx, fadeEndPx, px);
  return {
    x,
    y,
    z,
    sizeWorldMpc,
    axisRatio: ar,
    positionAngleDeg: pa,
    colourIndex,
    crossfadeAlpha,
    procFadeOut: 1.0,
    sourceCode,
    localIdx,
    sbAmp,
  };
}
