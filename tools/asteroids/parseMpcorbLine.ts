/**
 * parseMpcorbLine — one numbered MPCORB line into an `MpcorbRow`. Columns are MPC's 1-based ones
 * (data/raw/mpcorb/README.md). A row is named when its readable designation is `(n) Name` and not
 * `(n) 2026 DM18` (provisional) or `(n) 2040 P-L` (a Palomar–Leiden or Trojan survey designation).
 */
import type { MpcorbRow } from '../@types/asteroids/MpcorbRow';
import { asteroidClassFromOrbitType } from './asteroidClassFromOrbitType';
import { decodePackedEpoch } from './decodePackedEpoch';
import { decodePackedNumber } from './decodePackedNumber';

const ORBIT_TYPE_MASK = 0x3f;
const MPC_NEO_BIT = 1 << 11;
const MPC_PHA_BIT = 1 << 15;
const UNNAMED = /^\d{4} (?:[A-Z]{2}\d*|P-L|T-[123])$/;

const field = (line: string, first: number, last: number): string =>
  line.slice(first - 1, last).trim();

function numberAt(line: string, first: number, last: number, what: string): number {
  const text = field(line, first, last);
  const value = Number(text);
  if (text === '' || !Number.isFinite(value)) {
    throw new Error(`parseMpcorbLine: bad ${what} "${text}" in "${line.slice(0, 7)}"`);
  }
  return value;
}

const optionalNumberAt = (
  line: string,
  first: number,
  last: number,
  what: string,
): number | null => (field(line, first, last) === '' ? null : numberAt(line, first, last, what));

export function parseMpcorbLine(line: string): MpcorbRow {
  const number = decodePackedNumber(line.slice(0, 5));
  const flagsText = field(line, 162, 165);
  if (!/^[0-9A-Fa-f]{4}$/.test(flagsText)) {
    throw new Error(`parseMpcorbLine: bad flags "${flagsText}" for (${number})`);
  }
  const flags = parseInt(flagsText, 16);
  const readable = /^\((\d+)\) (.+)$/.exec(field(line, 167, 194));
  if (!readable || Number(readable[1]) !== number) {
    throw new Error(`parseMpcorbLine: readable designation disagrees with (${number})`);
  }
  return {
    number,
    h: optionalNumberAt(line, 9, 13, 'H'),
    g: optionalNumberAt(line, 15, 19, 'G'),
    epochJd: decodePackedEpoch(line.slice(20, 25)),
    meanAnomalyDeg: numberAt(line, 27, 35, 'M'),
    argPeriDeg: numberAt(line, 38, 46, 'peri'),
    nodeDeg: numberAt(line, 49, 57, 'node'),
    inclDeg: numberAt(line, 60, 68, 'incl'),
    e: numberAt(line, 71, 79, 'e'),
    aAu: numberAt(line, 93, 103, 'a'),
    asteroidClass: asteroidClassFromOrbitType(flags & ORBIT_TYPE_MASK),
    neo: (flags & MPC_NEO_BIT) !== 0,
    pha: (flags & MPC_PHA_BIT) !== 0,
    name: UNNAMED.test(readable[2]!) ? null : readable[2]!,
  };
}
