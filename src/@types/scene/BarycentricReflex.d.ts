/**
 * BarycentricReflex — a `BarycentricPair` with its secondary's elements resolved once, when
 * the drivers are built, so the per-frame placement does no lookup. `k` is the mass fraction.
 */

import type { OrbitalElements } from './OrbitalElements';

export type BarycentricReflex = { readonly secondary: OrbitalElements; readonly k: number };
