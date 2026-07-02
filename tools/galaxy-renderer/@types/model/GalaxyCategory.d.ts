/**
 * GalaxyCategory — the five broad morphological buckets the generator's
 * Hubble-type strings (`GalaxyParams.type`) collapse into. Downstream UI
 * (preset pickers, category-scoped defaults) groups by this rather than by
 * the raw type string, since e.g. 'Sa'..'Sc' and 'SBa'..'SBc' share almost
 * all of their generation logic and differ only in bar presence.
 */

export type GalaxyCategory = 'elliptical' | 'lenticular' | 'irregular' | 'barred' | 'spiral';
