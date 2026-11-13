/**
 * Reference Sun altitude (degrees, no refraction) from the NOAA Global Monitoring
 * Laboratory solar-position equations (the spreadsheet behind the NOAA solar
 * calculator, https://gml.noaa.gov/grad/solcalc/calcdetails.html, after Meeus,
 * Astronomical Algorithms ch. 25). Written out here so the engine's Kepler +
 * IAU-rotation chain is checked against an independent route.
 */

const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

export function noaaSunAltitudeDeg(jd: number, latDeg: number, lonDeg: number): number {
  const T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = rad(M);
  const C =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mr) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = rad(L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega)));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = rad(eps0 + 0.00256 * Math.cos(rad(omega)));
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const y = Math.tan(eps / 2) ** 2;
  const L0r = rad(L0);
  const eotMin =
    4 *
    deg(
      y * Math.sin(2 * L0r) -
        2 * e * Math.sin(Mr) +
        4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
        0.5 * y * y * Math.sin(4 * L0r) -
        1.25 * e * e * Math.sin(2 * Mr),
    );
  const utcMin = ((((jd + 0.5) % 1) + 1) % 1) * 1440;
  const hourAngle = rad((utcMin + eotMin + 4 * lonDeg) / 4 - 180);
  const lat = rad(latDeg);
  return deg(
    Math.asin(
      Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle),
    ),
  );
}
