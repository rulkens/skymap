import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');

/**
 * The numbers on the right of `name`'s declaration in one of the app's source
 * files, read as text: `const NAME = 8;`, `const SIZE: … = [256, 64];`, a
 * shader's `const STEPS: i32 = 128;`, or a property (`scale: 3,`). The site's
 * tests do not import the app, so a renamed or moved constant throws here and
 * the test that printed its number is looked at again.
 */
export function sourceNumbers(file: string, name: string): number[] {
  const text = readFileSync(resolve(ROOT, file), 'utf8');
  const declared =
    new RegExp(`\\bconst ${name}\\b[^=;]*=\\s*([^;]+);`).exec(text) ??
    new RegExp(`^\\s*${name}: ([^\\n]+),$`, 'm').exec(text);
  if (!declared) throw new Error(`${file} no longer declares ${name}`);
  const numbers = declared[1]!.match(/(?<![\w.])\d+(?:\.\d+)?(?:e-?\d+)?/g);
  if (!numbers) throw new Error(`${file}: ${name} is no longer a plain number`);
  return numbers.map(Number);
}
