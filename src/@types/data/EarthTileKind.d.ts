/**
 * EarthTileKind — the subset of `TextureKind` that Earth's virtual texture pages
 * in as tiles, as opposed to binding as one whole-globe map.
 *
 * Welded to the parent union with `Extract` rather than re-spelling the string
 * literals, so a `TextureKind` rename propagates here instead of leaving a stale
 * duplicate that still type-checks. The cost of `Extract` over a fresh union is
 * that the compiler rejects a member `TextureKind` does not have, which is
 * exactly the error worth having.
 *
 * Only `'surface'` is reachable today: the spec's Q1 (tile the normal map, or
 * leave relief whole-globe?) is deliberately deferred to a look judgement made on
 * the working build, and `'normal'` sits in this union so answering "yes" is a
 * matter of instantiating a second atlas rather than rewriting the type. See
 * `docs/superpowers/specs/2026-07-28-earth-surface-virtual-texture.md`.
 */

import type { TextureKind } from './TextureKind';

export type EarthTileKind = Extract<TextureKind, 'surface' | 'normal'>;
