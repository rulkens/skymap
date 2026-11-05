import { describe, it, expect } from 'vitest';
import { findCssReferences } from '../src/findCssReferences';

const values = (text: string) => findCssReferences(text).map((r) => r.value);

describe('findCssReferences', () => {
  it('finds CSS references', () => {
    const text = [
      `.a { composes: a b from './composed.css'; }`,
      `@import './import.css';`,
      `@import url(./urlimport.css);`,
      `.b { background: url('./a.png'); }`,
      `.c { background: url(plain.png); }`,
    ].join('\n');
    expect(values(text)).toEqual([
      './composed.css',
      './import.css',
      './urlimport.css',
      './a.png',
      'plain.png',
    ]);
  });

  it('reports spans that locate the value', () => {
    const text = `.a { background: url("./a.png"); }`;
    const [ref] = findCssReferences(text);
    expect(text.slice(ref!.start, ref!.end)).toBe('./a.png');
  });

  it('leaves CSS external urls and global composes alone', () => {
    const text = [
      `.a { background: url(https://x.test/a.png); }`,
      `.b { background: url(data:image/png;base64,AAAA); }`,
      `.c { fill: url(#a); }`,
      `.d { composes: x from global; }`,
      `.e { background: url('/public/a.png'); }`,
    ].join('\n');
    expect(values(text)).toEqual([]);
  });
});
