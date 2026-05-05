import { describe, it, expect } from 'vitest';

import { parseArgs } from '../../tools/buildFilaments';

/**
 * Tests for `parseArgs` in `tools/buildFilaments.ts`.
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
    expect(a).toEqual({ cut: 3, smooth: 1 });
    const b = parseArgs(['--smooth', '1', '--cut', '3']);
    expect(b).toEqual({ cut: 3, smooth: 1 });
  });
});
