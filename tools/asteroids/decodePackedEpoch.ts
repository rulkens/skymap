/**
 * decodePackedEpoch — MPC's 5-character packed date (`K2669` = 2026 June 9) as the Julian Date of its
 * 0h TT. Century I/J/K = 18/19/20, two year digits, then month and day in 1–9, A = 10 … V = 31.
 * Rules: data/raw/mpcorb/README.md.
 */
const CENTURIES: Readonly<Record<string, number>> = { I: 18, J: 19, K: 20 };
const MONTH_DAY = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
const UNIX_EPOCH_JD = 2_440_587.5;
const MS_PER_DAY = 86_400_000;

export function decodePackedEpoch(packed: string): number {
  const century = CENTURIES[packed[0] ?? ''];
  const month = MONTH_DAY.indexOf(packed[3] ?? '');
  const day = MONTH_DAY.indexOf(packed[4] ?? '');
  if (
    packed.length !== 5 ||
    century === undefined ||
    !/^\d\d$/.test(packed.slice(1, 3)) ||
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    throw new Error(`decodePackedEpoch: "${packed}" is not a packed date`);
  }
  // Date.UTC is proleptic Gregorian, and TT is a uniform day count, so the offset is exact.
  const year = century * 100 + Number(packed.slice(1, 3));
  return Date.UTC(year, month - 1, day) / MS_PER_DAY + UNIX_EPOCH_JD;
}
