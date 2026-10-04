/** One planet's Horizons heliocentric series: UT Julian dates and equatorial km per axis. */

export type HorizonsSeries = { jd: Float64Array; km: [Float64Array, Float64Array, Float64Array] };
