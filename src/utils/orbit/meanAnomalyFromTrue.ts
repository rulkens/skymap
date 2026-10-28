/**
 * The mean anomaly M at true anomaly ν on an ellipse of eccentricity e, through
 * the eccentric anomaly: tan(E/2) = √((1−e)/(1+e))·tan(ν/2), then Kepler's
 * M = E − e·sin E. The forward partner of `eccentricAnomalyFromMean`. Radians.
 */
export function meanAnomalyFromTrue(trueAnomalyRad: number, eccentricity: number): number {
  const half = trueAnomalyRad / 2;
  const eAnom =
    2 *
    Math.atan2(
      Math.sqrt(1 - eccentricity) * Math.sin(half),
      Math.sqrt(1 + eccentricity) * Math.cos(half),
    );
  return eAnom - eccentricity * Math.sin(eAnom);
}
