/** Quote a string value the way a FITS card expects, e.g. fitsCard('XTENSION', fitsStr('BINTABLE')). */
export function fitsStr(s: string): string {
  return `'${s}'`;
}
