/**
 * sStarElements — 39 bound S-stars from Gillessen+ 2017 (ApJ 837, 30, VizieR
 * `J/ApJ/837/30/table3`), plus S301 from Abd El Dayem+ 2026 (Nature; GRAVITY
 * Collaboration; arXiv:2607.12664). Each row carries its raw source line
 * verbatim so the transcription stays checkable — one file since these come
 * from different publications in different units.
 *
 * Units and frame are PUBLISHED: a is the TRUE semi-major axis as an angle at
 * R₀, sky angles in degrees, Tp/P in Julian years from J2000.0 — nothing is
 * converted here. Ω/i's frame flip (position angle → left-handed basis) lives
 * once, in `makers/sStar.ts`. S111 (unbound, e = 1.092) is excluded; R34/R44
 * are Gillessen's own names for two bound rows in the same table.
 */

import type { SStarSeed } from '../../@types/scene/SStarSeed';

/**
 * The bound rows of table3, in catalogue order, with S301 appended last (its
 * own comment format — see below). Each table3 comment is that star's
 * fixed-width source line, whose columns are, in order:
 *
 *     Star  a e_a  e e_e  i e_i  Ω e_Ω  ω e_ω  Tp e_Tp  P e_P  SpT  Kmag  r
 *
 * `r` is the paper's global rescaling factor and `SpT` its early/late flag
 * (blank for the two stars with no spectral classification); neither the
 * uncertainties nor `r` are carried into the seed, since nothing downstream
 * propagates them.
 *
 * The `ω` column is read as the ARGUMENT of periapsis, measured in the orbital
 * plane from the ascending node — the paper's Table 3 header. The VizieR ReadMe
 * glosses it as the "longitude of the pericenter", which taken literally would
 * mean ϖ = Ω + ω; that reading would rotate every orbit within its own plane by
 * its Ω. The astrometric fixture is what settles it.
 */
export const S_STAR_SEEDS: readonly SStarSeed[] = [
  {
    // S1       0.595  0.024  0.556  0.018  119.14 0.21 342.04  0.32 122.3   1.4  2001.80   0.15  166.0     5.8  e 14.7  1.75
    id: 's1',
    label: 'S1',
    semiMajorArcsec: 0.595,
    eccentricity: 0.556,
    inclinationDeg: 119.14,
    ascendingNodeDeg: 342.04,
    argPeriapsisDeg: 122.3,
    periapsisEpochYr: 2001.8,
    periodYr: 166.0,
    kMag: 14.7,
    spectralClass: 'early',
  },
  {
    // S2       0.1255 0.0009 0.8839 0.0019 134.18 0.40 226.94  0.60  65.51  0.57 2002.33   0.01   16.00    0.02 e 13.95 1.13
    id: 's2',
    label: 'S2',
    semiMajorArcsec: 0.1255,
    eccentricity: 0.8839,
    inclinationDeg: 134.18,
    ascendingNodeDeg: 226.94,
    argPeriapsisDeg: 65.51,
    periapsisEpochYr: 2002.33,
    periodYr: 16.0,
    kMag: 13.95,
    spectralClass: 'early',
  },
  {
    // S4       0.3570 0.0037 0.3905 0.0059  80.33 0.08 258.84  0.07 290.8   1.5  1957.4    1.2    77.0     1.0  e 14.4  1.25
    id: 's4',
    label: 'S4',
    semiMajorArcsec: 0.357,
    eccentricity: 0.3905,
    inclinationDeg: 80.33,
    ascendingNodeDeg: 258.84,
    argPeriapsisDeg: 290.8,
    periapsisEpochYr: 1957.4,
    periodYr: 77.0,
    kMag: 14.4,
    spectralClass: 'early',
  },
  {
    // S6       0.6574 0.0006 0.8400 0.0003  87.24 0.06  85.07  0.12 116.23  0.07 2108.61   0.03  192.0     0.17 e 15.4  1.58
    id: 's6',
    label: 'S6',
    semiMajorArcsec: 0.6574,
    eccentricity: 0.84,
    inclinationDeg: 87.24,
    ascendingNodeDeg: 85.07,
    argPeriapsisDeg: 116.23,
    periapsisEpochYr: 2108.61,
    periodYr: 192.0,
    kMag: 15.4,
    spectralClass: 'early',
  },
  {
    // S8       0.4047 0.0014 0.8031 0.0075  74.37 0.30 315.43  0.19 346.70  0.41 1983.64   0.24   92.9     0.41 e 14.5  1.18
    id: 's8',
    label: 'S8',
    semiMajorArcsec: 0.4047,
    eccentricity: 0.8031,
    inclinationDeg: 74.37,
    ascendingNodeDeg: 315.43,
    argPeriapsisDeg: 346.7,
    periapsisEpochYr: 1983.64,
    periodYr: 92.9,
    kMag: 14.5,
    spectralClass: 'early',
  },
  {
    // S9       0.2724 0.0041 0.644  0.020   82.41 0.24 156.60  0.10 150.6   1.0  1976.71   0.92   51.3     0.70 e 15.1  1.65
    id: 's9',
    label: 'S9',
    semiMajorArcsec: 0.2724,
    eccentricity: 0.644,
    inclinationDeg: 82.41,
    ascendingNodeDeg: 156.6,
    argPeriapsisDeg: 150.6,
    periapsisEpochYr: 1976.71,
    periodYr: 51.3,
    kMag: 15.1,
    spectralClass: 'early',
  },
  {
    // S12      0.2987 0.0018 0.8883 0.0017  33.56 0.49 230.1   1.8  317.9   1.5  1995.59   0.04   58.9     0.22 e 15.5  2.37
    id: 's12',
    label: 'S12',
    semiMajorArcsec: 0.2987,
    eccentricity: 0.8883,
    inclinationDeg: 33.56,
    ascendingNodeDeg: 230.1,
    argPeriapsisDeg: 317.9,
    periapsisEpochYr: 1995.59,
    periodYr: 58.9,
    kMag: 15.5,
    spectralClass: 'early',
  },
  {
    // S13      0.2641 0.0016 0.4250 0.0023  24.70 0.48  74.5   1.7  245.2   2.4  2004.86   0.04   49.00    0.14 e 15.8  3.25
    id: 's13',
    label: 'S13',
    semiMajorArcsec: 0.2641,
    eccentricity: 0.425,
    inclinationDeg: 24.7,
    ascendingNodeDeg: 74.5,
    argPeriapsisDeg: 245.2,
    periapsisEpochYr: 2004.86,
    periodYr: 49.0,
    kMag: 15.8,
    spectralClass: 'early',
  },
  {
    // S14      0.2863 0.0036 0.9761 0.0037 100.59 0.87 226.38  0.64 334.59  0.87 2000.12   0.06   55.3     0.48 e 15.7  2.16
    id: 's14',
    label: 'S14',
    semiMajorArcsec: 0.2863,
    eccentricity: 0.9761,
    inclinationDeg: 100.59,
    ascendingNodeDeg: 226.38,
    argPeriapsisDeg: 334.59,
    periapsisEpochYr: 2000.12,
    periodYr: 55.3,
    kMag: 15.7,
    spectralClass: 'early',
  },
  {
    // S17      0.3559 0.0096 0.397  0.011   96.83 0.11 191.62  0.21 326.0   1.9  1991.19   0.41   76.6     1.0  l 15.3  3.00
    id: 's17',
    label: 'S17',
    semiMajorArcsec: 0.3559,
    eccentricity: 0.397,
    inclinationDeg: 96.83,
    ascendingNodeDeg: 191.62,
    argPeriapsisDeg: 326.0,
    periapsisEpochYr: 1991.19,
    periodYr: 76.6,
    kMag: 15.3,
    spectralClass: 'late',
  },
  {
    // S18      0.2379 0.0015 0.471  0.012  110.67 0.18  49.11  0.18 349.46  0.66 1993.86   0.16   41.9     0.18 e 16.7  2.28
    id: 's18',
    label: 'S18',
    semiMajorArcsec: 0.2379,
    eccentricity: 0.471,
    inclinationDeg: 110.67,
    ascendingNodeDeg: 49.11,
    argPeriapsisDeg: 349.46,
    periapsisEpochYr: 1993.86,
    periodYr: 41.9,
    kMag: 16.7,
    spectralClass: 'early',
  },
  {
    // S19      0.520  0.094  0.750  0.043   71.96 0.35 344.60  0.62 155.2   2.3  2005.39   0.16  135.     14.   e 16.   2.57
    id: 's19',
    label: 'S19',
    semiMajorArcsec: 0.52,
    eccentricity: 0.75,
    inclinationDeg: 71.96,
    ascendingNodeDeg: 344.6,
    argPeriapsisDeg: 155.2,
    periapsisEpochYr: 2005.39,
    periodYr: 135.0,
    kMag: 16.0,
    spectralClass: 'early',
  },
  {
    // S21      0.2190 0.0017 0.764  0.014   58.8  1.0  259.64  0.62 166.4   1.1  2027.40   0.17   37.00    0.28 l 16.9  1.60
    id: 's21',
    label: 'S21',
    semiMajorArcsec: 0.219,
    eccentricity: 0.764,
    inclinationDeg: 58.8,
    ascendingNodeDeg: 259.64,
    argPeriapsisDeg: 166.4,
    periapsisEpochYr: 2027.4,
    periodYr: 37.0,
    kMag: 16.9,
    spectralClass: 'late',
  },
  {
    // S22      1.31   0.28   0.449  0.088  105.76 0.95 291.7   1.4   95.   20.   1996.9   10.2   540.     63.   e 16.6  2.78
    id: 's22',
    label: 'S22',
    semiMajorArcsec: 1.31,
    eccentricity: 0.449,
    inclinationDeg: 105.76,
    ascendingNodeDeg: 291.7,
    argPeriapsisDeg: 95.0,
    periapsisEpochYr: 1996.9,
    periodYr: 540.0,
    kMag: 16.6,
    spectralClass: 'early',
  },
  {
    // S23      0.253  0.012  0.56   0.14    48.0  7.1  249.   13.    39.0   6.7  2024.7    3.7    45.8     1.6  e 17.8  2.08
    id: 's23',
    label: 'S23',
    semiMajorArcsec: 0.253,
    eccentricity: 0.56,
    inclinationDeg: 48.0,
    ascendingNodeDeg: 249.0,
    argPeriapsisDeg: 39.0,
    periapsisEpochYr: 2024.7,
    periodYr: 45.8,
    kMag: 17.8,
    spectralClass: 'early',
  },
  {
    // S24      0.944  0.048  0.8970 0.0049 103.67 0.42   7.93  0.37 290.   15.   2024.50   0.03  331.     16.   l 15.6  1.54
    id: 's24',
    label: 'S24',
    semiMajorArcsec: 0.944,
    eccentricity: 0.897,
    inclinationDeg: 103.67,
    ascendingNodeDeg: 7.93,
    argPeriapsisDeg: 290.0,
    periapsisEpochYr: 2024.5,
    periodYr: 331.0,
    kMag: 15.6,
    spectralClass: 'late',
  },
  {
    // S29      0.428  0.019  0.728  0.052  105.8  1.7  161.96  0.80 346.5   5.9  2025.96   0.94  101.0     2.0  e 16.7  3.32
    id: 's29',
    label: 'S29',
    semiMajorArcsec: 0.428,
    eccentricity: 0.728,
    inclinationDeg: 105.8,
    ascendingNodeDeg: 161.96,
    argPeriapsisDeg: 346.5,
    periapsisEpochYr: 2025.96,
    periodYr: 101.0,
    kMag: 16.7,
    spectralClass: 'early',
  },
  {
    // S31      0.449  0.010  0.5497 0.0025 109.03 0.27 137.16  0.30 308.0   3.0  2018.07   0.14  108.      1.2  e 15.7  3.16
    id: 's31',
    label: 'S31',
    semiMajorArcsec: 0.449,
    eccentricity: 0.5497,
    inclinationDeg: 109.03,
    ascendingNodeDeg: 137.16,
    argPeriapsisDeg: 308.0,
    periapsisEpochYr: 2018.07,
    periodYr: 108.0,
    kMag: 15.7,
    spectralClass: 'early',
  },
  {
    // S33      0.657  0.026  0.608  0.064   60.5  2.5  100.1   5.5  303.7   1.6  1928.    12.    192.0     5.2  e 16.   2.21
    id: 's33',
    label: 'S33',
    semiMajorArcsec: 0.657,
    eccentricity: 0.608,
    inclinationDeg: 60.5,
    ascendingNodeDeg: 100.1,
    argPeriapsisDeg: 303.7,
    periapsisEpochYr: 1928.0,
    periodYr: 192.0,
    kMag: 16.0,
    spectralClass: 'early',
  },
  {
    // S38      0.1416 0.0002 0.8201 0.0007 171.1  2.1  101.06  0.24  17.99  0.25 2003.19   0.01   19.2     0.02 l 17.   2.48
    id: 's38',
    label: 'S38',
    semiMajorArcsec: 0.1416,
    eccentricity: 0.8201,
    inclinationDeg: 171.1,
    ascendingNodeDeg: 101.06,
    argPeriapsisDeg: 17.99,
    periapsisEpochYr: 2003.19,
    periodYr: 19.2,
    kMag: 17.0,
    spectralClass: 'late',
  },
  {
    // S39      0.370  0.015  0.9236 0.0021  89.36 0.73 159.03  0.10  23.3   3.8  2000.06   0.06   81.1     1.5    16.8  3.27
    id: 's39',
    label: 'S39',
    semiMajorArcsec: 0.37,
    eccentricity: 0.9236,
    inclinationDeg: 89.36,
    ascendingNodeDeg: 159.03,
    argPeriapsisDeg: 23.3,
    periapsisEpochYr: 2000.06,
    periodYr: 81.1,
    kMag: 16.8,
    spectralClass: 'unknown',
  },
  {
    // S42      0.95   0.18   0.567  0.083   67.16 0.66 196.14  0.75  35.8   3.2  2008.24   0.75  335.     58.   e 17.5  1.65
    id: 's42',
    label: 'S42',
    semiMajorArcsec: 0.95,
    eccentricity: 0.567,
    inclinationDeg: 67.16,
    ascendingNodeDeg: 196.14,
    argPeriapsisDeg: 35.8,
    periapsisEpochYr: 2008.24,
    periodYr: 335.0,
    kMag: 17.5,
    spectralClass: 'early',
  },
  {
    // S54      1.20   0.87   0.893  0.078   62.2  1.4  288.35  0.70 140.8   2.3  2004.46   0.07  477.    199.   e 17.5  2.60
    id: 's54',
    label: 'S54',
    semiMajorArcsec: 1.2,
    eccentricity: 0.893,
    inclinationDeg: 62.2,
    ascendingNodeDeg: 288.35,
    argPeriapsisDeg: 140.8,
    periapsisEpochYr: 2004.46,
    periodYr: 477.0,
    kMag: 17.5,
    spectralClass: 'early',
  },
  {
    // S55      0.1078 0.0010 0.7209 0.0077 150.1  2.2  325.5   4.0  331.5   3.9  2009.34   0.04   12.80    0.11   17.5  1.61
    id: 's55',
    label: 'S55',
    semiMajorArcsec: 0.1078,
    eccentricity: 0.7209,
    inclinationDeg: 150.1,
    ascendingNodeDeg: 325.5,
    argPeriapsisDeg: 331.5,
    periapsisEpochYr: 2009.34,
    periodYr: 12.8,
    kMag: 17.5,
    spectralClass: 'unknown',
  },
  {
    // S60      0.3877 0.0070 0.7179 0.0051 126.87 0.30 170.54  0.85  29.37  0.29 2023.89   0.09   87.1     1.4  e 16.3  1.65
    id: 's60',
    label: 'S60',
    semiMajorArcsec: 0.3877,
    eccentricity: 0.7179,
    inclinationDeg: 126.87,
    ascendingNodeDeg: 170.54,
    argPeriapsisDeg: 29.37,
    periapsisEpochYr: 2023.89,
    periodYr: 87.1,
    kMag: 16.3,
    spectralClass: 'early',
  },
  {
    // S66      1.502  0.095  0.128  0.043  128.5  1.6   92.3   3.2  134.   17.   1771.    38.    664.     37.   e 14.8  1.70
    id: 's66',
    label: 'S66',
    semiMajorArcsec: 1.502,
    eccentricity: 0.128,
    inclinationDeg: 128.5,
    ascendingNodeDeg: 92.3,
    argPeriapsisDeg: 134.0,
    periapsisEpochYr: 1771.0,
    periodYr: 664.0,
    kMag: 14.8,
    spectralClass: 'early',
  },
  {
    // S67      1.126  0.026  0.293  0.057  136.0  1.1   96.5   6.4  213.5   1.6  1705.    22.    431.     10.   e 12.1  1.43
    id: 's67',
    label: 'S67',
    semiMajorArcsec: 1.126,
    eccentricity: 0.293,
    inclinationDeg: 136.0,
    ascendingNodeDeg: 96.5,
    argPeriapsisDeg: 213.5,
    periapsisEpochYr: 1705.0,
    periodYr: 431.0,
    kMag: 12.1,
    spectralClass: 'early',
  },
  {
    // S71      0.973  0.040  0.899  0.013   74.0  1.3   35.16  0.86 337.8   4.9  1695.    21.    346.     11.   e 16.1  1.87
    id: 's71',
    label: 'S71',
    semiMajorArcsec: 0.973,
    eccentricity: 0.899,
    inclinationDeg: 74.0,
    ascendingNodeDeg: 35.16,
    argPeriapsisDeg: 337.8,
    periapsisEpochYr: 1695.0,
    periodYr: 346.0,
    kMag: 16.1,
    spectralClass: 'early',
  },
  {
    // S83      1.49   0.19   0.365  0.075  127.2  1.4   87.7   1.2  203.6   6.0  2046.8    6.3   656.     69.   e 13.6  1.82
    id: 's83',
    label: 'S83',
    semiMajorArcsec: 1.49,
    eccentricity: 0.365,
    inclinationDeg: 127.2,
    ascendingNodeDeg: 87.7,
    argPeriapsisDeg: 203.6,
    periapsisEpochYr: 2046.8,
    periodYr: 656.0,
    kMag: 13.6,
    spectralClass: 'early',
  },
  {
    // S85      4.6    3.30   0.78   0.15    84.78 0.29 107.36  0.43 156.3   6.8  1930.2    9.8  3580.   2550.   l 15.6  1.50
    id: 's85',
    label: 'S85',
    semiMajorArcsec: 4.6,
    eccentricity: 0.78,
    inclinationDeg: 84.78,
    ascendingNodeDeg: 107.36,
    argPeriapsisDeg: 156.3,
    periapsisEpochYr: 1930.2,
    periodYr: 3580.0,
    kMag: 15.6,
    spectralClass: 'late',
  },
  {
    // S87      2.74   0.16   0.224  0.027  119.54 0.87 106.32  0.99 336.1   7.7   611.   154.   1640.    105.   e 13.6  1.38
    id: 's87',
    label: 'S87',
    semiMajorArcsec: 2.74,
    eccentricity: 0.224,
    inclinationDeg: 119.54,
    ascendingNodeDeg: 106.32,
    argPeriapsisDeg: 336.1,
    periapsisEpochYr: 611.0,
    periodYr: 1640.0,
    kMag: 13.6,
    spectralClass: 'early',
  },
  {
    // S89      1.081  0.055  0.639  0.038   87.61 0.16 238.99  0.18 126.4   4.0  1783.    26.    406.     27.   l 15.3  1.16
    id: 's89',
    label: 'S89',
    semiMajorArcsec: 1.081,
    eccentricity: 0.639,
    inclinationDeg: 87.61,
    ascendingNodeDeg: 238.99,
    argPeriapsisDeg: 126.4,
    periapsisEpochYr: 1783.0,
    periodYr: 406.0,
    kMag: 15.3,
    spectralClass: 'late',
  },
  {
    // S91      1.917  0.089  0.303  0.034  114.49 0.32 105.35  0.74 356.4   1.6  1108.    69.    958.     50.   e 12.2  1.33
    id: 's91',
    label: 'S91',
    semiMajorArcsec: 1.917,
    eccentricity: 0.303,
    inclinationDeg: 114.49,
    ascendingNodeDeg: 105.35,
    argPeriapsisDeg: 356.4,
    periapsisEpochYr: 1108.0,
    periodYr: 958.0,
    kMag: 12.2,
    spectralClass: 'early',
  },
  {
    // S96      1.499  0.057  0.174  0.022  126.36 0.96 115.66  0.59 233.6   2.4  1646.    16.    662.     29.   e 10.   1.31
    id: 's96',
    label: 'S96',
    semiMajorArcsec: 1.499,
    eccentricity: 0.174,
    inclinationDeg: 126.36,
    ascendingNodeDeg: 115.66,
    argPeriapsisDeg: 233.6,
    periapsisEpochYr: 1646.0,
    periodYr: 662.0,
    kMag: 10.0,
    spectralClass: 'early',
  },
  {
    // S97      2.32   0.46   0.35   0.11   113.0  1.3  113.2   1.4   28.   14.   2132.    29.   1270.    309.   e 10.3  1.22
    id: 's97',
    label: 'S97',
    semiMajorArcsec: 2.32,
    eccentricity: 0.35,
    inclinationDeg: 113.0,
    ascendingNodeDeg: 113.2,
    argPeriapsisDeg: 28.0,
    periapsisEpochYr: 2132.0,
    periodYr: 1270.0,
    kMag: 10.3,
    spectralClass: 'early',
  },
  {
    // S145     1.12   0.18   0.50   0.25    83.7  1.6  263.92  0.94 185.   16.   1808.    58.    426.     71.   l 17.5  1.46
    id: 's145',
    label: 'S145',
    semiMajorArcsec: 1.12,
    eccentricity: 0.5,
    inclinationDeg: 83.7,
    ascendingNodeDeg: 263.92,
    argPeriapsisDeg: 185.0,
    periapsisEpochYr: 1808.0,
    periodYr: 426.0,
    kMag: 17.5,
    spectralClass: 'late',
  },
  {
    // S175     0.414  0.039  0.9867 0.0018  88.53 0.60 326.83  0.78  68.52  0.40 2009.51   0.01   96.2     5.0  e 17.5  2.72
    id: 's175',
    label: 'S175',
    semiMajorArcsec: 0.414,
    eccentricity: 0.9867,
    inclinationDeg: 88.53,
    ascendingNodeDeg: 326.83,
    argPeriapsisDeg: 68.52,
    periapsisEpochYr: 2009.51,
    periodYr: 96.2,
    kMag: 17.5,
    spectralClass: 'early',
  },
  {
    // R34      1.81   0.15   0.641  0.098  136.0  8.3  330.   19.    57.0   8.0  1522.    52.    877.     83.   e 14.   1.35
    id: 'r34',
    label: 'R34',
    semiMajorArcsec: 1.81,
    eccentricity: 0.641,
    inclinationDeg: 136.0,
    ascendingNodeDeg: 330.0,
    argPeriapsisDeg: 57.0,
    periapsisEpochYr: 1522.0,
    periodYr: 877.0,
    kMag: 14.0,
    spectralClass: 'early',
  },
  {
    // R44      3.9    1.4    0.27   0.27   131.0  5.2   80.5   7.1  217.   24.   1963.    85.   2730.   1350.   e 14.   1.11
    id: 'r44',
    label: 'R44',
    semiMajorArcsec: 3.9,
    eccentricity: 0.27,
    inclinationDeg: 131.0,
    ascendingNodeDeg: 80.5,
    argPeriapsisDeg: 217.0,
    periapsisEpochYr: 1963.0,
    periodYr: 2730.0,
    kMag: 14.0,
    spectralClass: 'early',
  },
  {
    // Abd El Dayem+ 2026 (Nature; GRAVITY Collaboration), Extended Data Table 2,
    // Solution A: a 83.0±0.7 mas  e 0.9832±0.0010  i 124.09±1.10  Ω 73.8±3.5
    //   ω 293.4±2.2  Tp 2023.126±0.010  P 8.68±0.11 yr  χ²=25.86  mK 19.3±0.3
    // Solution B (degenerate, unused): e 0.9824  i 122.84  Ω 256.9  ω 115.1
    //   Tp 2023.125  P 8.68 yr  χ²=25.53 — same a. R₀ here assumed 8277 pc vs.
    //   this repo's 8178 pc; stored in arcsec, so converted like every row.
    // Late-A/early-F (~F1.5V) dwarf: `unknown` (~5800 K, 1.5 R☉) reads closer
    // to that than the hot-dwarf `early` or cool-giant `late` bins.
    id: 's301',
    label: 'S301',
    semiMajorArcsec: 0.083,
    eccentricity: 0.9832,
    inclinationDeg: 124.09,
    ascendingNodeDeg: 73.8,
    argPeriapsisDeg: 293.4,
    periapsisEpochYr: 2023.126,
    periodYr: 8.68,
    kMag: 19.3,
    spectralClass: 'unknown',
  },
];
