/**
 * EarthTileKind — the subset of `TextureKind` Earth's virtual texture pages
 * in as tiles, rather than binding whole-globe. Welded via `Extract` (not
 * a fresh union) so a `TextureKind` rename propagates instead of leaving a
 * stale duplicate. Only `'surface'` is reachable today; `'normal'` sits in
 * the union so tiling it later is a one-word edit (see
 * docs/superpowers/specs/2026-07-28-earth-surface-virtual-texture.md).
 */

import type { TextureKind } from './TextureKind';

export type EarthTileKind = Extract<TextureKind, 'surface' | 'normal'>;
