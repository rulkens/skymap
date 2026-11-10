import type { FieldTargetId } from '../../../../src/layers/milkyWay/field/@types/FieldTargetId';

/**
 * The reduced targets' divisors, each its own live slider, keyed like the
 * field's targets so a new `FieldTargetId` fails to compile until it has one.
 */
export type TargetDivisors = Readonly<Record<FieldTargetId | 'aggregate', number>>;
