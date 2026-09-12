/** The value of a `--name value` / `--name=value` argv flag, or `undefined`.
 *  `parseFlags` beside this file stays boolean-only on purpose. */
export function argValue(argv: readonly string[], name: string): string | undefined {
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline !== undefined) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`argValue: ${name} needs a value`);
  }
  return value;
}
