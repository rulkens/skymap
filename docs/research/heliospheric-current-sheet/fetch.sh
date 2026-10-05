#!/bin/sh
# Download the WSO inputs: the tilt table (Carrington-rotation start dates) and one
# source-surface synoptic map per rotation (R250 = radial model, 2.5 Rsun), plus the
# classic-model (S) maps parse.py falls back to where R250 has gaps.
set -e
cd "$(dirname "$0")"
mkdir -p wso
curl -sfL -o tilts.html http://wso.stanford.edu/Tilts.html
seq 1642 2303 | xargs -P 4 -I{} sh -c 'curl -sfL -m 60 --retry 3 -o wso/WSO-R250.{}.txt http://wso.stanford.edu/synoptic/WSO-R250.{}.txt || true'
for c in 2215 2216 2217 2302; do curl -sfL -m 60 -o wso/WSO-S.$c.txt http://wso.stanford.edu/synoptic/WSO-S.$c.txt; done
