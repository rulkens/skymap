# MPCORB — Minor Planet Center orbit database

`MPCORB.DAT.gz`: osculating orbital elements of every minor planet the MPC publishes, one 202-character
line each. The numbered objects come first, after a 43-line header that ends with a `-----` rule, and end
at the first blank line; unnumbered multi-opposition and recent one-opposition objects follow and are not
used.

- **Upstream:** <https://www.minorplanetcenter.net/iau/MPCORB/MPCORB.DAT.gz> (overview:
  <https://www.minorplanetcenter.net/iau/MPCORB.html>). Rewritten daily.
- **Fetch:** `npm run fetch-mpcorb` (`tools/fetch/fetchMpcorb.ts`), kept for a day unless `--force`.
- **Consumer:** `npm run build-asteroids` (`tools/asteroids/buildAsteroids.ts`) reads the `.gz` through a
  gunzip stream; no unpacked copy is kept (321 MB).
- **Copy behind the first bake:** fetched 2026-11-12, 94,257,550 bytes gzipped (320,788,432 unpacked),
  sha256 `36f15b16156b49206a7e91e1dc4d6a91d8264b6047cdfae0a3c927e86872dd82`. 895,910 numbered rows,
  numbers 1…895,910, all at epoch `K2669` (2026 June 9.0 TT, JD 2461200.5). No `.sha256` sidecar: the file
  changes every day, so there is no fixed copy to pin.

## Terms

The file's own header (lines 10–16 and 24–26), copied verbatim:

```
   Software programs may include this datafile amongst their datasets, as
   long as this header is included (it is acceptable if it is contained
   in a file separate from the actual data) and that proper attribution
   to the Minor Planet Center is given.  Credit to the individual orbit
   computers is implicit by the inclusion of a reference and the name of
   the orbit computer on each orbit record.  Information on how to obtain
   updated copies of the datafile must also be included.

New versions of this file, updated on a daily basis, will be available at:

          https://www.minorplanetcenter.org/iau/MPCORB/MPCORB.DAT
```

`build-asteroids` meets this by writing `public/data/asteroids/v1/mpcorb-header.txt` beside the data: the 43
header lines verbatim, a line saying the elements are derived and quantized, and the update URL.

The MPC's website use policy (<https://www.minorplanetcenter.net/iau/WWWPolicy.html>, read 2026-11-12)
says of data files, verbatim:

```
            Data files are copyrighted entities and may be redistributed
            as long as the source for the data is clearly specified.
```

## Line format

From "Export Format for Minor-Planet Orbits",
<https://www.minorplanetcenter.net/iau/info/MPOrbitFormat.html> (read 2026-11-12), verbatim. Columns are
1-based.

```

   Columns   F77    Use

    1 -   7  a7     Number or provisional designation
                      (in packed form)
    9 -  13  f5.2   Absolute magnitude, H
   15 -  19  f5.2   Slope parameter, G

   21 -  25  a5     Epoch (in packed form, .0 TT)
   27 -  35  f9.5   Mean anomaly at the epoch, in degrees

   38 -  46  f9.5   Argument of perihelion, J2000.0 (degrees)
   49 -  57  f9.5   Longitude of the ascending node, J2000.0
                      (degrees)
   60 -  68  f9.5   Inclination to the ecliptic, J2000.0 (degrees)

   71 -  79  f9.7   Orbital eccentricity
   81 -  91  f11.8  Mean daily motion (degrees per day)
   93 - 103  f11.7  Semimajor axis (AU)

  106        i1     Uncertainty parameter, U
          or a1     If this column contains `E' it indicates
                    that the orbital eccentricity was assumed.
                    For one-opposition orbits this column can
                    also contain `D' if a double (or multiple)
                    designation is involved or `F' if an e-assumed
                    double (or multiple) designation is involved.

  108 - 116  a9     Reference
  118 - 122  i5     Number of observations
  124 - 126  i3     Number of oppositions

     For multiple-opposition orbits:
     128 - 131  i4     Year of first observation
     132        a1     '-'
     133 - 136  i4     Year of last observation

     For single-opposition orbits:
     128 - 131  i4     Arc length (days)
     133 - 136  a4     'days'

  138 - 141  f4.2   r.m.s residual (")
  143 - 145  a3     Coarse indicator of perturbers
                    (blank if unperturbed one-opposition object)
  147 - 149  a3     Precise indicator of perturbers
                    (blank if unperturbed one-opposition object)
  151 - 160  a10    Computer name

There may sometimes be additional information beyond column 160
as follows:

  162 - 165  z4.4   4-hexdigit flags
                    The bottom 6 bits (bits 0 to 5) are used to encode
                    a value representing the orbit type (other
                    values are undefined):

                     Value
                        1  Atira
                        2  Aten
                        3  Apollo
                        4  Amor
                        5  Object with q < 1.665 AU
                        6  Hungaria
                        7  Unused or internal MPC use only
                        8  Hilda
                        9  Jupiter Trojan
                       10  Distant object

                    Additional information is conveyed by
                    adding in the following bit values:

               Bit  Value
                 6     64  Unused or internal MPC use only
                 7    128  Unused or internal MPC use only
                 8    256  Unused or internal MPC use only
                 9    512  Unused or internal MPC use only
                10   1024  Unused or internal MPC use only
                11   2048  Object is NEO
                12   4096  Object is 1-km (or larger) NEO
                13   8192  1-opposition object seen at
                           earlier opposition
                14  16384  Critical list numbered object
                15  32768  Object is PHA

                    Note that the orbit classification is
                      based on cuts in osculating element
                      space and is not 100% reliable.

                    Note also that certain of the flags
                      are for internal MPC use and are
                      not documented.

  167 - 194  a      Readable designation

  195 - 202  i8     Date of last observation included in
                      orbit solution (YYYYMMDD format)
```

The bake keeps the low 6 bits (orbit type) for the class and bits 11 (NEO) and 15 (PHA) as flags.

## Packed permanent numbers

From "Packed Provisional and Permanent Designations",
<https://www.minorplanetcenter.net/iau/info/PackedDes.html> (read 2026-11-12), section "Permanent
Designations / Minor Planets", verbatim:

```
If the minor-planet number is less than 100000, then the number
is stored as a zero-padded right-justified string.  E.g., (3202) is
stored as "03202", (50000) as "50000".

When the number is above 99999, the number MOD 10000 is stored in
columns 2-5 of the string and the number DIV 10000 is represented by
the letters A-Z (if between 10 and 35, inclusive) or a-z (if between
36 and 61, inclusive).  E.g., (100345) is represented as "A0345",
(360017) as "a0017", and (203289) as "K3289".

Numbers above 619999 will be indicated using a tilde, "~", as the first character. The subsequent
4 characters will all be base-62 (0-9, then A-Z if between 10 and 35 inclusive, then a-z if
between 36 and 61 inclusive) and used to store the target number MINUS 620,000.

E.g.

(620000) is represented as ~0000 (i.e. 620,000 - 620,000 = 0 = 0*62^3 + 0*62^2 + 0*62^1 + 0*62^0).

(620061) is represented as ~000z (i.e. 620,061 - 620,000 = 61 = 0*62^3 + 0*62^2 + 0*62^1 + 61*62^0).

(3140113) is represented as ~AZaz (i.e. 3140113 - 620,000 =  2520113 = 10*62^3 + 35*62^2 + 36*62^1 + 61*62^0).

(15396335) is represented as ~zzzz (i.e. 15396335 - 620,000 =  14776335 = 61*62^3 + 61*62^2 + 61*62^1 + 61*62^0)
```

## Packed dates (the epoch column)

From "Packed Dates", <https://www.minorplanetcenter.net/iau/info/PackedDates.html> (read 2026-11-12),
verbatim:

```
Dates of the form YYYYMMDD may be packed into five characters to
conserve space.

The first two digits of the year are packed into a single character
in column 1 (I = 18, J = 19, K = 20).  Columns 2-3 contain the last
two digits of the year.  Column 4 contains the month and column
5 contains the day, coded as detailed below:

   Month     Day      Character         Day      Character
                     in Col 4 or 5              in Col 4 or 5
   Jan.       1           1             17           H
   Feb.       2           2             18           I
   Mar.       3           3             19           J
   Apr.       4           4             20           K
   May        5           5             21           L
   June       6           6             22           M
   July       7           7             23           N
   Aug.       8           8             24           O
   Sept.      9           9             25           P
   Oct.      10           A             26           Q
   Nov.      11           B             27           R
   Dec.      12           C             28           S
             13           D             29           T
             14           E             30           U
             15           F             31           V
             16           G

Examples:

   1996 Jan. 1    = J9611
   1996 Jan. 10   = J961A
   1996 Sept.30   = J969U
   1996 Oct. 1    = J96A1
   2001 Oct. 22   = K01AM
```
