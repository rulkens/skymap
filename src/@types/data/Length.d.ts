/**
 * Length — a value tagged with its unit, so a seed row states what it
 * measures in rather than relying on a field-name suffix. Compact structures
 * (open clusters, nebulae) are naturally pc; cluster-scale ones are Mpc.
 */
export type Length = { readonly value: number; readonly unit: 'pc' | 'kpc' | 'Mpc' };
