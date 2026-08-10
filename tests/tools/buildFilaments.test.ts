import { describe, it, expect } from 'vitest';

import { parseArgs } from '../../tools/filaments/buildFilaments';
import { FILAMENT_DATA_PREFIX } from '../../src/data/filament/filamentBinaryFormat';

/**
 * Tests for `parseArgs` in `tools/filaments/buildFilaments.ts`.
 *
 * The DisPerSE pipeline itself shells out to native binaries (delaunay_3D,
 * mse, skelconv) which are NOT on CI — so we deliberately limit coverage
 * to the pure CLI-parsing helper.  That helper now takes `argv` as an
 * explicit parameter, which is what makes these tests possible: each
 * scenario constructs its own argv array and inspects the parsed result
 * without ever touching `process.argv`.
 *
 * Why test parseArgs at all?  This is the user-facing surface of the
 * tool — `--cut`, `--smooth`, `--sources`, `--output` all flow through
 * here.  A typo or an off-by-one in the loop would silently change the
 * meaning of a build command (e.g. swallow `--smooth`'s value as the next
 * flag's name).  Tests pin the parser's contract so future flag additions
 * don't regress the existing knobs.
 */
describe('parseArgs', () => {
  it('returns defaults when given no arguments', () => {
    const result = parseArgs([]);
    expect(result.cut).toBe(5);
    expect(result.smooth).toBe(2);
  });

  it('parses --cut as a numeric override', () => {
    const result = parseArgs(['--cut', '7']);
    expect(result.cut).toBe(7);
    expect(result.smooth).toBe(2);
  });

  it('parses --smooth as a numeric override', () => {
    const result = parseArgs(['--smooth', '4']);
    expect(result.cut).toBe(5);
    expect(result.smooth).toBe(4);
  });

  it('parses --cut and --smooth together regardless of order', () => {
    // Why both orders?  The hand-rolled loop walks argv left-to-right,
    // so an off-by-one in the `++i` increment would swap which flag
    // claims which value.  Asserting both orderings catches that class
    // of bug.
    const a = parseArgs(['--cut', '3', '--smooth', '1']);
    expect(a).toMatchObject({ cut: 3, smooth: 1 });
    const b = parseArgs(['--smooth', '1', '--cut', '3']);
    expect(b).toMatchObject({ cut: 3, smooth: 1 });
  });

  // ── --sources / --output flags + cache prefix derivation ────────────────

  it('returns the merged-build defaults when --sources is omitted', () => {
    // The default-when-omitted contract preserves the original behavior:
    // 2MRS + GLADE merged, written under the filament epoch folder, with
    // a stable cache prefix derived from those two source names.  Any
    // change here flips every existing build script, so we pin it.
    const result = parseArgs([]);
    expect(result.sources).toEqual(['2mrs', 'glade']);
    expect(result.outputPath).toBe(`public/data/${FILAMENT_DATA_PREFIX}/filaments.bin`);
    expect(result.cachePrefix).toBe('2mrs+glade');
  });

  it('parses --sources sdss as a single-source diagnostic build', () => {
    const result = parseArgs(['--sources', 'sdss']);
    expect(result.sources).toEqual(['sdss']);
    expect(result.cachePrefix).toBe('sdss');
    // outputPath default is unchanged — caller is expected to pass
    // --output explicitly for a diagnostic build to avoid clobbering the
    // canonical filaments.bin.
    expect(result.outputPath).toBe(`public/data/${FILAMENT_DATA_PREFIX}/filaments.bin`);
  });

  it('sorts --sources alphabetically when deriving cache prefix', () => {
    // Why sort?  The cache prefix must be stable across argv orderings
    // — `--sources sdss,2mrs,glade` and `--sources glade,2mrs,sdss`
    // describe the same build, so they should hit the same cached
    // Delaunay tessellation on disk.  Sorting normalises the prefix.
    const result = parseArgs(['--sources', 'sdss,2mrs,glade']);
    expect(result.sources).toEqual(['2mrs', 'glade', 'sdss']);
    expect(result.cachePrefix).toBe('2mrs+glade+sdss');
  });

  it('parses --output as the final .bin path', () => {
    const result = parseArgs(['--output', 'foo.bin']);
    expect(result.outputPath).toBe('foo.bin');
    // sources/cachePrefix unchanged from the default merged build.
    expect(result.sources).toEqual(['2mrs', 'glade']);
    expect(result.cachePrefix).toBe('2mrs+glade');
  });

  it('parses all four flags together', () => {
    const result = parseArgs([
      '--cut',
      '7',
      '--smooth',
      '3',
      '--sources',
      'sdss',
      '--output',
      'bar.bin',
    ]);
    expect(result).toEqual({
      cut: 7,
      smooth: 3,
      sources: ['sdss'],
      cachePrefix: 'sdss',
      outputPath: 'bar.bin',
    });
  });

  it('throws on an unknown source token, listing valid choices', () => {
    // The error message must contain BOTH the offending token and the
    // legal alternatives — the operator typing `--sources sloan` deserves
    // an actionable correction, not a generic "bad input" message.
    expect(() => parseArgs(['--sources', 'weird'])).toThrow(/weird/);
    expect(() => parseArgs(['--sources', 'weird'])).toThrow(/sdss/);
    expect(() => parseArgs(['--sources', 'weird'])).toThrow(/2mrs/);
    expect(() => parseArgs(['--sources', 'weird'])).toThrow(/glade/);
  });

  it('throws on empty --sources value', () => {
    // `--sources ""` is almost certainly a shell-quoting mistake; bailing
    // here is friendlier than silently degrading to the default merge
    // (which would mask the typo).
    expect(() => parseArgs(['--sources', ''])).toThrow();
  });

  it('throws when --sources is the last argv token (missing value)', () => {
    // Without this guard the loop would silently treat the missing slot
    // as `undefined` and default to the merged build — same friendly-
    // failure rationale as the empty-string case above.
    expect(() => parseArgs(['--sources'])).toThrow();
  });
});
