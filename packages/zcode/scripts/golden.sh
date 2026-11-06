#!/usr/bin/env bash
set -euo pipefail

# Regenerates the Ztools golden files: infodump's output for every fixture.
#
# Usage:
#   scripts/golden.sh <path-to-infodump>
#
# Ztools has no license, so nothing of it is in this repository: build infodump yourself, outside
# the repo, from Ztools 7/3.1a (ztools731a.zip, the 2024 modern-C update, on the IF Archive):
#
#   cc -O2 -o infodump infodump.c showhead.c showdict.c showobj.c showverb.c txio.c \
#      infinfo.c symbols.c getopt.c
#
# (The Unix makefile leaves out Ztools' own getopt.c.) Then run this from packages/zcode. It builds
# the fixtures, runs `infodump -<opt> <fixture>` for each of -i -a -o -t -d, and writes
# test/golden/<fixture>.<opt>.txt. Commit the result with PROVENANCE.md updated.

INFODUMP="${1:?Usage: scripts/golden.sh <path-to-infodump>}"
[[ -x "$INFODUMP" ]] || { echo "Not an executable: $INFODUMP" >&2; exit 1; }
INFODUMP="$(cd "$(dirname "$INFODUMP")" && pwd)/$(basename "$INFODUMP")"
[[ -f package.json && "$(node -p 'require("./package.json").name')" == "@frotzinc/zcode" ]] ||
  { echo "Run this from packages/zcode." >&2; exit 1; }

# --force: a compiler change must reach the stories before infodump reads them.
node scripts/build-fixtures.mjs --force
mkdir -p test/golden
# Golden files of renamed or removed fixtures would otherwise linger, untested.
rm -f test/golden/*.txt
(
  # infodump formats each line, the story's name included, into an 80-byte stack buffer: a long
  # path overflows it and infodump dies silently (SIGTRAP on macOS). So: bare filenames, run from
  # the fixtures' own folder.
  cd test/.fixtures &&
    for story in *.z[0-9]; do
      name="${story%.*}"
      for opt in i a o t d; do
        "$INFODUMP" "-$opt" "$story" > "../golden/$name.$opt.txt" ||
          { echo "infodump -$opt $story failed (exit $?)" >&2; exit 1; }
      done
      echo "golden: $name"
    done
)
