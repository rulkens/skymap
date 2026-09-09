/**
 * SurfaceBandKnob — which `SURFACE_REGIME` edge a `setSurfaceBand` call
 * clamped: the OTHER knob than the one the caller patched, or `null` when
 * the write needed no clamp at all.
 */

export type SurfaceBandKnob = 'engage' | 'disengage' | null;
