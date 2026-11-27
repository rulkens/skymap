import { describe, expect, it } from 'vitest';
import { parseAsciiNumber } from '../../../../src/utils/text/parseAsciiNumber';

const encoder = new TextEncoder();
const same = (field: string): void => {
  // Padded, so a scan that runs past `end` reads digits that are not in the field.
  const bytes = encoder.encode(`9${field}9`);
  expect(Object.is(parseAsciiNumber(bytes, 1, bytes.length - 1), Number(field)), field).toBe(true);
};

describe('parseAsciiNumber', () => {
  it('reads what Number reads, edge cases', () => {
    const fields = [
      ...['0', '-0', '+0', '-0.0e5', '0e99999', '12', '-12', '+12', '.5', '5.', '-.5', '+.5e1'],
      ...['1e5', '1E-5', '1e+22', '1e23', '1e-22', '1e-23', '123456789012345', '1234567890123456'],
      ...['0.000000000000000000001', '0.1', '0.3', '1.7976931348623157e308', '5e-324', '1e400'],
      ...['', '-', '+', '.', '-.', 'e5', '1e', '1e+', '1.2.3', '1e5.5', '--1', '+-1', '1 2'],
      ...['0x1A', '0b11', '0o17', 'Infinity', '-Infinity', 'NaN', ' 7 ', '7\t', '1,5', 'abc'],
      ...['00012', '0012.3400', '-239.4123', '201.2345', '0.0423456', '9007199254740993'],
    ];
    for (const field of fields) same(field);
  });

  it('reads what Number reads, random decimals', () => {
    let seed = 12345;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const digits = (n: number): string =>
      Array.from({ length: n }, () => Math.floor(random() * 10)).join('');
    for (let k = 0; k < 20000; k++) {
      const sign = ['', '-', '+'][Math.floor(random() * 3)]!;
      const whole = digits(Math.floor(random() * 10));
      const frac = random() < 0.7 ? `.${digits(Math.floor(random() * 12))}` : '';
      const exp =
        random() < 0.3
          ? `e${random() < 0.5 ? '-' : ''}${digits(1 + Math.floor(random() * 2))}`
          : '';
      same(`${sign}${whole}${frac}${exp}`);
    }
  });
});
