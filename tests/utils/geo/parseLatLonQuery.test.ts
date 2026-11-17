/**
 * parseLatLonQuery — the palette's typed place: map order (lat, lon) unless a
 * compass letter names the axis, in which case the letter wins whatever the order.
 */
import { describe, it, expect } from 'vitest';

import { parseLatLonQuery } from '../../../src/utils/geo/parseLatLonQuery';

describe('parseLatLonQuery', () => {
  it('reads bare numbers in map order, latitude first', () => {
    expect(parseLatLonQuery('52.37, 4.89')).toEqual({ latDeg: 52.37, lonDeg: 4.89 });
    expect(parseLatLonQuery('-33.96 18.40')).toEqual({ latDeg: -33.96, lonDeg: 18.4 });
  });

  it('lets compass letters name the axes in either order, negating S and W', () => {
    expect(parseLatLonQuery('4.89°E 52.37°N')).toEqual({ latDeg: 52.37, lonDeg: 4.89 });
    expect(parseLatLonQuery('33.96S, 18.40E')).toEqual({ latDeg: -33.96, lonDeg: 18.4 });
    expect(parseLatLonQuery('112.1w 36.06n')).toEqual({ latDeg: 36.06, lonDeg: -112.1 });
  });

  it('takes one lettered token as naming its axis and the other as the remaining one', () => {
    expect(parseLatLonQuery('4.89E, 52.37')).toEqual({ latDeg: 52.37, lonDeg: 4.89 });
  });

  it('rejects two tokens on the same axis', () => {
    expect(parseLatLonQuery('52N 4N')).toBeNull();
  });

  it('rejects a latitude past a pole or a longitude past the antimeridian', () => {
    expect(parseLatLonQuery('91, 4')).toBeNull();
    expect(parseLatLonQuery('52, 181')).toBeNull();
  });

  it('rejects anything that is not exactly two coordinates', () => {
    expect(parseLatLonQuery('')).toBeNull();
    expect(parseLatLonQuery('Amsterdam')).toBeNull();
    expect(parseLatLonQuery('52.37')).toBeNull();
    expect(parseLatLonQuery('52.37, 4.89, 3')).toBeNull();
  });
});
