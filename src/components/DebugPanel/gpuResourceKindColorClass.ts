/**
 * gpuResourceKindColorClass — the one `GpuResourceKind` → colour-class lookup.
 * Reuses loadStateColors' committing/ready swatches (already proven distinct
 * and readable-on-dark in this panel) rather than adding a third hardcoded
 * colour pair.
 */

import type { GpuResourceKind } from '../../@types/gpu/memory/GpuResourceKind';
import colors from './loadStateColors.module.css';

const BY_KIND: Record<GpuResourceKind, string> = {
  buffer: colors.colorCommitting!,
  texture: colors.colorReady!,
};

export function gpuResourceKindColorClass(kind: GpuResourceKind): string {
  return BY_KIND[kind];
}
