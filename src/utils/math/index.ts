/**
 * Barrel re-export for src/utils/math.
 *
 * Consumers import from './utils/math' and get everything in one place.
 * The internal _sexagesimal helper is intentionally excluded — it is an
 * implementation detail of the formatting functions, not a public API.
 */

export * from './constants';
export * from './redshiftToDistanceMpc';
export * from './raDecZToCartesian';
export * from './cartesianToRaDecZ';
export * from './formatRaSexagesimal';
export * from './formatDecSexagesimal';
export * from './sdssName';
export * from './lookbackTimeGyr';
export * from './hubbleVelocityKmS';
export * from './absoluteMagnitude';
export * from './earthEraForLookback';
export * from './galaxyTypeFromColor';
export * from './easeOutCubic';
export * from './lerp';
export * from './lerpAngleShortest';
export * from './sdssExplorerUrl';
export * from './sdssThumbnailUrl';
