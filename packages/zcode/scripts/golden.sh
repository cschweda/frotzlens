#!/usr/bin/env bash
set -euo pipefail

# Regenerates the Ztools golden files: infodump's output for every fixture.
#
# Usage:
#   scripts/golden.sh <path-to-infodump> <path-to-txd>
#
# Ztools has no license, so nothing of it is in this repository: build infodump and txd yourself,
# outside the repo, from Ztools 7/3.1a (ztools731a.zip, the 2024 modern-C update, on the IF Archive):
#
#   cc -O2 -o infodump infodump.c showhead.c showdict.c showobj.c showverb.c txio.c \
#      infinfo.c symbols.c getopt.c
#   cc -O2 -o txd txd.c txio.c showverb.c infinfo.c symbols.c showobj.c getopt.c
#
# (The Unix makefile leaves out Ztools' own getopt.c.) Then run this from packages/zcode. It builds
# the fixtures, runs `infodump -<opt> <fixture>` for each of -i -a -o -t -d -m -g, writing
# test/golden/<fixture>.<opt>.txt, and txd (as it is, and -n), writing <fixture>.txd.txt.gz and
# <fixture>.txd-n.txt.gz. Commit the result with PROVENANCE.md updated.
#
# PunyInform stories (puny-*) get no -m or -g files: infodump reads their grammar (version 3) as
# version 1 and stops with "Fatal: game file read error". Their txd files are kept; the tests
# compare them without txd's grammar notes, which come from the same misreading.

INFODUMP="${1:?Usage: scripts/golden.sh <path-to-infodump> <path-to-txd>}"
TXD="${2:?Usage: scripts/golden.sh <path-to-infodump> <path-to-txd>}"
for tool in "$INFODUMP" "$TXD"; do [[ -x "$tool" ]] || { echo "Not an executable: $tool" >&2; exit 1; }; done
INFODUMP="$(cd "$(dirname "$INFODUMP")" && pwd)/$(basename "$INFODUMP")"
TXD="$(cd "$(dirname "$TXD")" && pwd)/$(basename "$TXD")"
[[ -f package.json && "$(node -p 'require("./package.json").name')" == "@frotzinc/zcode" ]] ||
  { echo "Run this from packages/zcode." >&2; exit 1; }

# --force: a compiler change must reach the stories before infodump reads them.
node scripts/build-fixtures.mjs --force
mkdir -p test/golden
# Golden files of renamed or removed fixtures would otherwise linger, untested.
rm -f test/golden/*.txt test/golden/*.txt.gz
(
  # infodump formats each line, the story's name included, into an 80-byte stack buffer: a long
  # path overflows it and infodump dies silently (SIGTRAP on macOS). So: bare filenames, run from
  # the fixtures' own folder.
  cd test/.fixtures &&
    for story in *.z[0-9]; do
      name="${story%.*}"
      opts="i a o t d m g"
      [[ "$name" == puny-* ]] && opts="i a o t d"
      for opt in $opts; do
        "$INFODUMP" "-$opt" "$story" > "../golden/$name.$opt.txt" ||
          { echo "infodump -$opt $story failed (exit $?)" >&2; exit 1; }
      done
      # txd: on a PunyInform v3 story it can stop partway (exit 1, after its grammar notes); what it
      # printed is kept, and the tests know which those are. Any other failure stops the run.
      for mode in "" "-n"; do
        out="../golden/$name.txd${mode}.txt.gz"
        set +e
        "$TXD" $mode "$story" | gzip -9n > "$out"
        statuses=("${PIPESTATUS[@]}")
        set -e
        if [[ ${statuses[1]} -ne 0 ]]; then
          echo "gzip failed writing $out (exit ${statuses[1]})" >&2
          exit 1
        fi
        if [[ ${statuses[0]} -ne 0 && "$name" != puny-* ]]; then
          echo "txd $mode $story failed (exit ${statuses[0]})" >&2
          exit 1
        fi
      done
      echo "golden: $name"
    done
)
