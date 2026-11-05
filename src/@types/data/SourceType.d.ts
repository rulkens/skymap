import { Source } from '../../data/source';

/**
 * Union of every numeric value in the `Source` const object — the
 * type used for indexing `APP_SOURCE_REGISTRY`, gating renderer paths,
 * and annotating per-source function signatures.
 *
 * Named `SourceType` (not `Source`) so consumers can import both the
 * value (`Source` from `data/source`) and the type (`SourceType` from
 * here) in a single file without a name clash.
 *
 * Derived from the const declaration rather than spelled out so
 * adding a new source widens the union automatically.
 */
export type SourceType = (typeof Source)[keyof typeof Source];
