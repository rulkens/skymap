// The inverse of hashedDataName. The infix is only ever stripped when it is
// exactly 8 lowercase-hex characters immediately before the extension — a
// looser match (e.g. "any dot-separated hex-looking run") would silently eat
// real filename components (`mcpm-small.scfd`, `desi-deep.bin`) and blind
// allowDataFile's hashed/logical equivalence.
const HASH_INFIX = /^(.*)\.([0-9a-f]{8})(\.[^.]+)$/;

export function logicalDataName(name: string): string {
  const m = name.match(HASH_INFIX);
  return m ? `${m[1]}${m[3]}` : name;
}
