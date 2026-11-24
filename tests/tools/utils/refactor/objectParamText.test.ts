import { describe, expect, it } from 'vitest';
import { objectParamText } from '../../../../tools/utils/refactor/objectParamText';

function convert(list: string) {
  return objectParamText(list, { start: 0, end: list.length });
}

describe('objectParamText', () => {
  it('two annotated parameters', () => {
    expect(convert('width: number, height: number')).toEqual({
      ok: true,
      text: '{ width, height }: { width: number; height: number }',
      names: ['width', 'height'],
    });
  });

  it('a default becomes an optional key', () => {
    const result = convert('width: number, height: number = 2');
    expect(result).toMatchObject({
      text: '{ width, height = 2 }: { width: number; height?: number }',
    });
  });

  it('an optional parameter stays optional', () => {
    expect(convert('width: number, label?: string')).toMatchObject({
      text: '{ width, label }: { width: number; label?: string }',
    });
  });

  it('keeps a type with its own commas and arrows verbatim', () => {
    expect(convert('a: Map<string, number>, b: (x: number) => void')).toMatchObject({
      text: '{ a, b }: { a: Map<string, number>; b: (x: number) => void }',
    });
  });

  it('refuses a rest parameter', () => {
    expect(convert('a: number, ...rest: number[]')).toMatchObject({
      ok: false,
      refusal: expect.stringContaining('rest parameter'),
    });
  });

  it('refuses a default without an annotation', () => {
    expect(convert('a: number, b = 2')).toMatchObject({
      ok: false,
      refusal: expect.stringContaining('would have to be inferred'),
    });
  });

  it('refuses a single parameter', () => {
    expect(convert('a: number')).toMatchObject({
      ok: false,
      refusal: expect.stringContaining('nothing to gain'),
    });
  });

  it('refuses a this parameter and an existing destructure', () => {
    expect(convert('this: Window, a: number')).toMatchObject({ ok: false });
    expect(convert('{ a }: { a: number }, b: number')).toMatchObject({
      ok: false,
      refusal: expect.stringContaining('already a destructured'),
    });
  });
});
