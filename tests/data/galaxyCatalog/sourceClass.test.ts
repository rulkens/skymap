/**
 * Unit tests for the per-source classification + parent-survey
 * lookup helpers.  These two functions are the only sites that know
 * how to interpret the `classByte` / `parentSurveyByte` slots on
 * the .bin's per-record layout; the rest of the engine is opaque
 * to the byte semantics.
 */
import { describe, it, expect } from 'vitest';
import {
  sourceClassLabel,
  milliquasParentSurveyPrefix,
} from '../../../src/data/galaxyCatalog/sourceClass';
import { Source } from '../../../src/data/sources';

describe('sourceClassLabel', () => {
  it('returns null for Milliquas byte 0 (unclassified)', () => {
    expect(sourceClassLabel(Source.Milliquas, 0)).toBeNull();
  });

  it('returns null for DESI byte 0 (unclassified) and unrecognised DESI bytes', () => {
    expect(sourceClassLabel(Source.DesiDeep, 0)).toBeNull();
    expect(sourceClassLabel(Source.DesiDeep, 99)).toBeNull();
    expect(sourceClassLabel(Source.DesiWedge, 0)).toBeNull();
    expect(sourceClassLabel(Source.DesiSgw, 0)).toBeNull();
  });

  it('returns null for an unrecognised Milliquas class byte', () => {
    // Defensive: a future Milliquas release might introduce a new
    // class letter we don't recognise yet.  The function should
    // degrade to null rather than crash the InfoCard.
    expect(sourceClassLabel(Source.Milliquas, 99)).toBeNull();
  });
});

describe('milliquasParentSurveyPrefix', () => {
  it('returns null for the OTHER sentinel (byte 0)', () => {
    expect(milliquasParentSurveyPrefix(0)).toBeNull();
  });

  it('returns null for an unrecognised byte', () => {
    expect(milliquasParentSurveyPrefix(99)).toBeNull();
  });
});
