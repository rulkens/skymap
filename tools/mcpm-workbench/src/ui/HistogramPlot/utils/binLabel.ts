import { COUNT_BIN_COUNT } from './COUNT_BIN_COUNT';
import { LOG_BIN_OFFSET } from './LOG_BIN_OFFSET';

/**
 * The mark under count bar `bin`: '∅' for the null bin (density ≤ 1e-5), else
 * the bin's decade as its exponent n, the bar holding densities in
 * [base^n, base^(n+1)). The last bar also takes everything above (the shader
 * clamps the index), so it reads 'n+'.
 */
export function binLabel(bin: number): string {
  if (bin === 0) return '∅';
  const exponent = bin - 1 - LOG_BIN_OFFSET;
  const digits = exponent < 0 ? `−${-exponent}` : `${exponent}`;
  return bin === COUNT_BIN_COUNT - 1 ? `${digits}+` : digits;
}
