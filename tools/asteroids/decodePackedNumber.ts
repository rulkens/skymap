/**
 * decodePackedNumber — MPC's 5-character packed minor-planet number: plain digits below 100000, a letter
 * (A–Z = 10–35, a–z = 36–61) for number DIV 10000 plus 4 digits up to 619999, then `~` and 4 base-62
 * digits holding number − 620000. Rules: data/raw/mpcorb/README.md.
 */
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const TILDE_OFFSET = 620_000;

function digit62(packed: string, ch: string): number {
  const value = BASE62.indexOf(ch);
  if (value < 0) throw new Error(`decodePackedNumber: bad character in "${packed}"`);
  return value;
}

export function decodePackedNumber(packed: string): number {
  if (packed.length !== 5) throw new Error(`decodePackedNumber: "${packed}" is not 5 characters`);
  if (packed[0] === '~') {
    let value = 0;
    for (const ch of packed.slice(1)) value = value * 62 + digit62(packed, ch);
    return TILDE_OFFSET + value;
  }
  if (!/^[0-9A-Za-z]\d{4}$/.test(packed)) {
    throw new Error(`decodePackedNumber: "${packed}" is not a packed number`);
  }
  return digit62(packed, packed[0]!) * 10_000 + Number(packed.slice(1));
}
