/** An asteroid is keyed by its MPC number, which is permanent: row = number − 1. */
export type AsteroidRef = { readonly type: 'asteroid'; readonly number: number };
