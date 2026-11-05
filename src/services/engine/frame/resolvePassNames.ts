import type { ContentPass } from '../../../@types/engine/frame/ContentPass';

/** Authored names → the contributed rows, in authored order; absent names drop. */
export function resolvePassNames(
  names: readonly string[],
  passes: readonly ContentPass[],
): readonly ContentPass[] {
  return names
    .map((name) => passes.find((pass) => pass.name === name))
    .filter((pass): pass is ContentPass => pass !== undefined);
}
