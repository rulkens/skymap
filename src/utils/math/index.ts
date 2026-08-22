/**
 * Barrel re-export for src/utils/math.
 *
 * Consumers import from './utils/math' and get everything in one place.
 * The internal _sexagesimal helper is intentionally excluded — it is an
 * implementation detail of the formatting functions, not a public API.
 */

export * from './constants';
export * from './apparentSizePx';
export * from './apparentDiameterPx';
export * from './galaxyDiameterKpc';
export * from './defaultGalaxyDiameterKpc';
export * from './arcsecToKpc';
export * from './redshiftToDistanceMpc';
export * from './distanceMpcToRedshift';
export * from './raDecZToCartesian';
export * from './cartesianToRaDecZ';
export * from './cartesianToRaDec';
export * from './formatRaSexagesimal';
export * from './formatDecSexagesimal';
export * from './sdssName';
export * from './iauName';
export * from './iauRaDecSuffix';
export * from './lookbackTimeGyr';
export * from './hubbleVelocityKmS';
export * from './absoluteMagnitude';
export * from './earthEraForLookback';
export * from './galaxyType';
export * from './galaxyTypeFromBminusJ';
export * from './galaxyTypeFromColor';
export * from './galaxyTypeFromJminusK';
export * from './smoothstep';
export * from './horizonShellFadeAlpha';
export * from './easeOutCubic';
export * from './lerp';
export * from './lerpAngleShortest';
export * from './sdssExplorerUrl';
export * from './sdssThumbnailUrl';
export * from './dssThumbnailUrl';
export * from './sdssNavigateUrl';
export * from './aladinLiteUrl';
export * from './galaxyThumbnailFovArcmin';
export * from './nedByNameUrl';
export * from './nedNearPositionUrl';
export * from './absoluteFromApparent';
export * from './apparentFromAbsolute';
export * from './dMaxFromAbsolute';
export * from './expectedNumberDensity';
export * from './vMaxWeight';
export * from './bulgeBrightness';
export * from './diskBrightness';
export * from './combinedBrightness';
