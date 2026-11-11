/** Every string key of any arm of a union; plain `keyof` on a union keeps only the keys all arms share. */
export type KeysOfUnion<T> = T extends unknown ? Extract<keyof T, string> : never;
