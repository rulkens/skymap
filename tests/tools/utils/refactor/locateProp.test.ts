import { describe, expect, it } from 'vitest';
import { locateProp } from '../../../../tools/utils/refactor/locateProp';

const FILE = 'src/shape.ts';
const at = (typeName: string, prop: string) => ({ file: FILE, typeName, prop });

function slice(text: string, typeName: string, prop: string): string {
  const found = locateProp(text, at(typeName, prop));
  if (!found.ok) throw new Error(found.refusal);
  return text.slice(found.at.start, found.at.end);
}

describe('locateProp', () => {
  it('finds a member of a type alias', () => {
    const text = 'export type Shape = { sides: number; radius: number };';
    const found = locateProp(text, at('Shape', 'radius'));
    expect(found).toEqual({
      ok: true,
      at: { file: FILE, start: text.indexOf('radius'), end: text.indexOf('radius') + 6 },
    });
  });

  it('finds a member of an exported interface', () => {
    expect(slice('export interface Shape { radius: number }', 'Shape', 'radius')).toBe('radius');
  });

  it('finds a string-keyed member inside its quotes, either quote style', () => {
    const single = "export type Shape = { 'radius': number };";
    const double = 'export type Shape = { "radius": number };';
    expect(slice(single, 'Shape', 'radius')).toBe('radius');
    expect(single[locateOf(single)! - 1]).toBe("'");
    expect(slice(double, 'Shape', 'radius')).toBe('radius');
  });

  it('refuses a union type', () => {
    const found = locateProp(
      'export type Shape = { radius: number } | { side: number };',
      at('Shape', 'radius'),
    );
    expect(found).toEqual({ ok: false, refusal: expect.stringContaining('not an object type') });
  });

  it('refuses an intersection type', () => {
    const found = locateProp('export type Shape = A & { radius: number };', at('Shape', 'radius'));
    expect(found.ok).toBe(false);
  });

  it('refuses a type that is not exported', () => {
    const found = locateProp('type Shape = { radius: number };', at('Shape', 'radius'));
    expect(found).toEqual({
      ok: false,
      refusal: expect.stringContaining('not an exported declaration'),
    });
  });

  it('refuses a missing member and lists the members', () => {
    const found = locateProp(
      'export type Shape = { sides: number; "tilt": number };',
      at('Shape', 'radius'),
    );
    expect(found).toEqual({
      ok: false,
      refusal: expect.stringMatching(/no direct member 'radius'.*sides, tilt/),
    });
  });

  it('refuses a member that is nested, not direct', () => {
    const found = locateProp(
      'export type Shape = { inner: { radius: number } };',
      at('Shape', 'radius'),
    );
    expect(found.ok).toBe(false);
  });
});

function locateOf(text: string): number | undefined {
  const found = locateProp(text, at('Shape', 'radius'));
  return found.ok ? found.at.start : undefined;
}
