import { describe, it, expect } from 'vitest';
import { CF4_TABLE_URL, CF4_README_URL } from '../../tools/fetch/fetchCosmicflows4';

describe('Cosmicflows-4 fetcher URLs', () => {
  it('points at the CDS Vizier table for J/ApJ/944/94', () => {
    expect(CF4_TABLE_URL).toBe(
      'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table2.dat',
    );
  });

  it('points at the matching ReadMe so the parser can validate column offsets', () => {
    expect(CF4_README_URL).toBe(
      'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/ReadMe',
    );
  });
});
