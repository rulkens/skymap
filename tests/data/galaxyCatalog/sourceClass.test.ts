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
  MILLIQUAS_CLASS_BYTE,
  MILLIQUAS_PARENT_SURVEY_BYTE,
} from '../../../src/data/galaxyCatalog/sourceClass';
import { Source } from '../../../src/data/sources';

describe('sourceClassLabel', () => {
  it('maps each Milliquas class byte to the corresponding human label', () => {
    expect(sourceClassLabel(Source.Milliquas, MILLIQUAS_CLASS_BYTE.Q)).toBe('Quasar');
    expect(sourceClassLabel(Source.Milliquas, MILLIQUAS_CLASS_BYTE.A)).toBe('AGN type-1');
    expect(sourceClassLabel(Source.Milliquas, MILLIQUAS_CLASS_BYTE.B)).toBe('BL Lac');
    expect(sourceClassLabel(Source.Milliquas, MILLIQUAS_CLASS_BYTE.K)).toBe('Seyfert-1 narrow');
    expect(sourceClassLabel(Source.Milliquas, MILLIQUAS_CLASS_BYTE.N)).toBe('Seyfert-1 broad');
    expect(sourceClassLabel(Source.Milliquas, MILLIQUAS_CLASS_BYTE.S)).toBe('Candidate');
  });

  it('returns null for Milliquas byte 0 (unclassified)', () => {
    expect(sourceClassLabel(Source.Milliquas, 0)).toBeNull();
  });

  it('returns null for any non-Milliquas source today', () => {
    expect(sourceClassLabel(Source.SDSS, 0)).toBeNull();
    expect(sourceClassLabel(Source.SDSS, 1)).toBeNull();
    expect(sourceClassLabel(Source.TwoMRS, 5)).toBeNull();
    expect(sourceClassLabel(Source.Glade, 3)).toBeNull();
    expect(sourceClassLabel(Source.FamousGalaxy, 2)).toBeNull();
    expect(sourceClassLabel(Source.Synthetic, 1)).toBeNull();
  });

  it('returns null for an unrecognised Milliquas class byte', () => {
    // Defensive: a future Milliquas release might introduce a new
    // class letter we don't recognise yet.  The function should
    // degrade to null rather than crash the InfoCard.
    expect(sourceClassLabel(Source.Milliquas, 99)).toBeNull();
  });
});

describe('milliquasParentSurveyPrefix', () => {
  it('maps each parent-survey byte to its display prefix', () => {
    expect(milliquasParentSurveyPrefix(MILLIQUAS_PARENT_SURVEY_BYTE.SDSS)).toBe('SDSS');
    expect(milliquasParentSurveyPrefix(MILLIQUAS_PARENT_SURVEY_BYTE.TWOMASX)).toBe('2MASX');
    expect(milliquasParentSurveyPrefix(MILLIQUAS_PARENT_SURVEY_BYTE.GAIA)).toBe('GAIA');
    expect(milliquasParentSurveyPrefix(MILLIQUAS_PARENT_SURVEY_BYTE.WISEA)).toBe('WISEA');
    expect(milliquasParentSurveyPrefix(MILLIQUAS_PARENT_SURVEY_BYTE.NVSS)).toBe('NVSS');
    expect(milliquasParentSurveyPrefix(MILLIQUAS_PARENT_SURVEY_BYTE.FIRST)).toBe('FIRST');
    expect(milliquasParentSurveyPrefix(MILLIQUAS_PARENT_SURVEY_BYTE.SIXDFGS)).toBe('6dFGS');
  });

  it('returns null for the OTHER sentinel (byte 0)', () => {
    expect(milliquasParentSurveyPrefix(0)).toBeNull();
  });

  it('returns null for an unrecognised byte', () => {
    expect(milliquasParentSurveyPrefix(99)).toBeNull();
  });
});
