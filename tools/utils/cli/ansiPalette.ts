/**
 * ansiPalette — a factory that hands back a set of string colorizers, either
 * live (ANSI SGR escapes) or inert (identity), chosen by a single `enabled`
 * flag the CALLER decides.
 *
 * Why a factory rather than colorizing inside the formatter? So the report
 * printer (`formatReport`) can stay a PURE function of its inputs: it takes a
 * `Palette` and never touches `process`. TTY detection — "is stdout a
 * terminal, is NO_COLOR set, are we in --json mode" — is an environment
 * decision that belongs in the harness (`measurePerf.main`), not smeared
 * through the thing that lays out text. Inject the palette and the same
 * formatter renders colored output to a terminal, plain output to a pipe, and
 * plain output in a test, with no branching of its own.
 *
 * When disabled every colorizer is the identity, so piped and JSON output
 * carry no escape bytes. When enabled each wraps its argument in the colour's
 * SGR introducer and the reset (`\x1b[0m`), the standard terminal convention.
 */

export type Palette = {
  red: (s: string) => string;
  green: (s: string) => string;
  yellow: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
};

export function ansiPalette(enabled: boolean): Palette {
  if (!enabled) {
    const identity = (s: string): string => s;
    return { red: identity, green: identity, yellow: identity, dim: identity, bold: identity };
  }
  const wrap =
    (code: string) =>
    (s: string): string =>
      `\x1b[${code}m${s}\x1b[0m`;
  return {
    red: wrap('31'),
    green: wrap('32'),
    yellow: wrap('33'),
    dim: wrap('2'),
    bold: wrap('1'),
  };
}
