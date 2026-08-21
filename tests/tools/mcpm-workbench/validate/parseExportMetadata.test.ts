/**
 * Fixture is the real upstream export_metadata.txt for SDSS_z_44-476mpc,
 * curl'd directly during T22 to confirm the field format (the file itself
 * is tiny text — never the 2.3 GB trace.bin alongside it). Expected
 * origin/voxel-size values are hand-computed from the same numbers, not
 * read back out of the implementation.
 */
import { describe, expect, it } from 'vitest';
import { parseExportMetadata } from '../../../../tools/mcpm-workbench/validate/parseExportMetadata';

const REAL_METADATA_TEXT = `dataset: data/SDSS/sdssGalaxy_rsdCorr_dbscan_e2p0ms3_dz0p001_m10p0_t=0.0
number of data points: 324849
number of agents: 10M
simulation grid resolution: 712 x 1200 x 728 [vox]
simulation grid size: 556.288 x 937.564 x 568.789 [mpc]
simulation grid center: (-239.469, -16.5618, 201.275) [mpc]

move distance: 0.1 [mpc]
move distance grid: 0.127991 [vox]
sense distance: 4.6 [mpc]
sense distance grid: 5.8876 [vox]
move spread: 10 [deg]
sense spread: 20 [deg]
persistence coefficient: 0.8
agent deposit: 0
sampling sharpness: 2.5
`;

describe('parseExportMetadata', () => {
  it('parses the real export_metadata.txt field format', () => {
    const meta = parseExportMetadata(REAL_METADATA_TEXT);

    expect(meta.dataPointCount).toBe(324849);
    expect(meta.dims).toEqual([712, 1200, 728]);

    // voxelSizeMpc = gridSize / dims, hand-computed:
    //   556.288/712 = 0.7813033707865169
    //   937.564/1200 = 0.7813033333333333
    //   568.789/728  = 0.7813035714285714
    expect(meta.voxelSizeMpc[0]).toBeCloseTo(0.7813033707865169, 10);
    expect(meta.voxelSizeMpc[1]).toBeCloseTo(0.7813033333333333, 10);
    expect(meta.voxelSizeMpc[2]).toBeCloseTo(0.7813035714285714, 10);

    // originMpc = center - gridSize/2, hand-computed:
    //   -239.469 - 278.144   = -517.613
    //   -16.5618 - 468.782   = -485.3438
    //   201.275  - 284.3945  = -83.1195
    expect(meta.originMpc[0]).toBeCloseTo(-517.613, 6);
    expect(meta.originMpc[1]).toBeCloseTo(-485.3438, 6);
    expect(meta.originMpc[2]).toBeCloseTo(-83.1195, 6);
  });

  it('throws when the expected fields are absent', () => {
    expect(() => parseExportMetadata('not a metadata file')).toThrow(/could not find/);
  });
});
