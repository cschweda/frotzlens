#!/usr/bin/env bash
set -euo pipefail

# Frotzlens publish script: puts one release of one package (an @frotzinc/* library, or the
# frotzlens CLI) on npm, from your machine.
#
# Usage:
#   ./publish.sh <package>             publish packages/<package>/package.json's version to npm
#   ./publish.sh <package> --dry-run   run every check and a dry-run publish; change nothing, ask for
#                                      no approval (if you're not logged in to npm, it warns instead)
#   ./publish.sh --help                print this
#   <package> is worker-rpc, nuxt-base, inform6-wasm, zcode (or the full @frotzinc/<name>), or cli
#   (the unscoped frotzlens CLI; `frotzlens` works too). Publish zcode before the CLI that needs it.
#
# A release comes first, and this script never makes one: bump the package's version, add its
# CHANGELOG.md section, merge to main, and push the tag <package name>@<version> (e.g.
# @frotzinc/zcode@0.1.0, frotzlens@0.1.0). The ci
# workflow runs on the tag. Then, from main: ./publish.sh <package> --dry-run, then
# ./publish.sh <package>. There is no version argument and no bump: the version is the release's.
# A publish asks for npm's approval last, just before it publishes: a link to open in a browser on
# any device, or npm's code on some accounts.
#
# Works in Git Bash on Windows as well as on macOS and Linux.
#
# Before anything is published, it checks that:
#   - you're in the Frotzlens repository's root, on main (or at the release's tag), up to date with
#     origin/main, with a clean tree, and logged in to npm and to the GitHub CLI;
#   - the release exists: the tag @frotzinc/<name>@<version> is on this branch, the package's
#     CHANGELOG.md has its section, the ci workflow passed for the tag, and <version> isn't on npm;
#   - the tag's own commit (in a temporary worktree, so nothing later on main leaks in) installs,
#     builds, typechecks, passes the package's tests, and packs;
#   - the tarball holds the files the package must ship and nothing it mustn't (tests, sources,
#     configs), has no install scripts, and has its license: MIT for the libraries, with no runtime
#     dependencies; GPL-3.0-or-later for the CLI, whose one dependency is @frotzinc/zcode at an exact
#     version already on npm;
#   - the packed tarball installs in a scratch project and its smoke test (scripts/smoke/<name>.mjs)
#     passes against it.
# It then shows the package's commits in the release, asks for the version to be typed, and then
# for npm's approval. What it publishes is the tarball it installed and ran. It never commits,
# tags, or pushes: the release did those.

SCOPE="@frotzinc"
BRANCH="main"
WORKFLOW="ci.yml"
PACKAGES="worker-rpc nuxt-base inform6-wasm zcode cli"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
info() { echo -e "${GREEN}[frotzlens]${NC} $1"; }
warn() { echo -e "${YELLOW}[frotzlens]${NC} $1"; }
error() { echo -e "${RED}[frotzlens]${NC} $1" >&2; }
die() {
  error "$1"
  exit 1
}

# The usage: the comment at the top of this file, from "Usage:" to the first blank comment line.
usage() {
  awk '/^# Usage:/ { on = 1 } on && /^#$/ { exit } on { sub(/^# ?/, ""); print }' "$0"
}

# What each package's tarball must hold (paths inside the package).
required_files() {
  case "$1" in
    worker-rpc)
      echo package.json README.md CHANGELOG.md LICENSE \
        dist/index.js dist/index.d.ts dist/testing.js dist/testing.d.ts
      ;;
    nuxt-base)
      echo package.json README.md CHANGELOG.md LICENSE nuxt.config.ts app/app.config.ts \
        app/utils/safe-storage.ts app/utils/slug.ts app/utils/shortcut.ts css/base.css css/palette.css \
        netlify/check-sw.mjs netlify/inject-preloads.mjs netlify/redirects.mjs netlify/version.mjs
      ;;
    zcode)
      echo package.json README.md CHANGELOG.md LICENSE \
        dist/index.js dist/index.d.ts dist/format/index.js dist/format/index.d.ts
      ;;
    cli)
      echo package.json README.md CHANGELOG.md LICENSE dist/bin.js dist/main.js
      ;;
    inform6-wasm)
      echo package.json README.md CHANGELOG.md LICENSE \
        dist/index.js dist/index.d.ts dist/library.js dist/library.d.ts dist/lib-texts.generated.js \
        wasm/inform6.mjs wasm/inform6.wasm wasm/inform6.d.mts wasm/README.md wasm/LICENSE-inform6 \
        lib/std/LICENSE-inform6lib lib/std/parser.h lib/std/exits.h lib/puny/LICENSE-punyinform lib/puny/puny.h
      ;;
  esac
}
# What no tarball may hold.
FORBIDDEN_RE='(\.test\.|(^|/)src/|(^|/)node_modules/|(^|/)tsconfig[^/]*\.json$|\.tgz$|(^|/)scripts/)'

# ─── Arguments ──────────────────────────────────────────────────────

DRY_RUN=false
NAME=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --help | -h)
      usage
      exit 0
      ;;
    -*)
      usage
      die "Unknown option '$arg'. There is no version argument: the version is the release's."
      ;;
    *)
      [[ -z "$NAME" ]] || {
        usage
        die "One package at a time ('$NAME' and '$arg' given)."
      }
      NAME="${arg#"$SCOPE"/}"
      [[ "$NAME" == frotzlens ]] && NAME=cli
      ;;
  esac
done
[[ -n "$NAME" ]] || {
  usage
  die "Name the package to publish: one of $PACKAGES."
}
[[ " $PACKAGES " == *" $NAME "* ]] || die "'$NAME' isn't a publishable package (one of $PACKAGES)."

# The CLI is the one unscoped package: frotzlens, from packages/cli, GPL, depending on zcode.
if [[ "$NAME" == cli ]]; then
  PACKAGE_NAME="frotzlens"
  LICENSE_ID="GPL-3.0-or-later"
else
  PACKAGE_NAME="$SCOPE/$NAME"
  LICENSE_ID="MIT"
fi
DIR="packages/$NAME"
MANIFEST="$DIR/package.json"

# A problem that stops a publish, and that a dry run only warns about (so it can show the rest).
problem() {
  if [[ "$DRY_RUN" == true ]]; then
    warn "$1 A publish would stop here."
  else
    die "$1"
  fi
}

# Read a package manifest with Node (CommonJS, whatever the package's type).
pkg_field() {
  node --input-type=commonjs -e "console.log(require(require('path').resolve(process.argv[1])).$2)" "$1"
}

# ─── Clean up on the way out ────────────────────────────────────────

WORK=""
WORKTREE=""
cleanup() {
  if [[ -n "$WORKTREE" ]]; then
    git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
    git worktree prune >/dev/null 2>&1 || true
  fi
  [[ -z "$WORK" ]] || rm -rf "$WORK"
}
trap cleanup EXIT

# ─── Preflight ──────────────────────────────────────────────────────

[[ -f pnpm-workspace.yaml && -f "$MANIFEST" ]] ||
  die "No pnpm-workspace.yaml or $MANIFEST here. Run this from the Frotzlens repository's root."
for tool in git node pnpm npm gh tar; do
  command -v "$tool" >/dev/null || die "$tool is required."
done
[[ "$(pkg_field "$MANIFEST" name)" == "$PACKAGE_NAME" ]] || die "$MANIFEST isn't $PACKAGE_NAME."
gh auth status >/dev/null 2>&1 || die "The GitHub CLI isn't logged in (gh auth login)."

VERSION=$(pkg_field "$MANIFEST" version)
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || die "$MANIFEST has no usable version ('$VERSION')."
TAG="$PACKAGE_NAME@$VERSION"
info "$PACKAGE_NAME version: $VERSION (tag $TAG)"

if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  die "Uncommitted changes. Commit or stash them first."
fi

info "Fetching origin/$BRANCH and the tags..."
git fetch --quiet origin "$BRANCH" --tags
HEAD_COMMIT=$(git rev-parse HEAD)
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
AT_TAG=false
git tag --points-at HEAD | grep -qxF "$TAG" && AT_TAG=true
if [[ "$CURRENT_BRANCH" != "$BRANCH" && "$AT_TAG" == false ]]; then
  problem "Publish from $BRANCH or from the tag $TAG (you're on $CURRENT_BRANCH)."
fi
if [[ "$HEAD_COMMIT" != "$(git rev-parse "origin/$BRANCH")" && "$AT_TAG" == false ]]; then
  problem "$BRANCH and origin/$BRANCH differ, and HEAD isn't the tag $TAG. Pull (or push) first."
fi

if npm whoami >/dev/null 2>&1; then
  info "npm user: $(npm whoami)"
elif [[ "$DRY_RUN" == true ]]; then
  # Logging in writes a token to ~/.npmrc, and a dry run changes nothing.
  warn "Not logged in to npm. The dry run continues; a real publish will ask you to log in."
else
  warn "Not logged in to npm. Logging in now..."
  npm login
  info "npm user: $(npm whoami)"
fi

# ─── The release must exist first ───────────────────────────────────

if npm view "$PACKAGE_NAME@$VERSION" version >/dev/null 2>&1; then
  die "$PACKAGE_NAME@$VERSION is already on npm."
fi
FIRST_TIME=false
if ! npm view "$PACKAGE_NAME" version >/dev/null 2>&1; then
  FIRST_TIME=true
  warn "$PACKAGE_NAME isn't on npm yet: this is its first publish."
fi

TAG_COMMIT=""
if TAG_COMMIT=$(git rev-parse -q --verify "refs/tags/$TAG^{commit}"); then
  git merge-base --is-ancestor "$TAG_COMMIT" HEAD ||
    problem "The tag $TAG ($TAG_COMMIT) isn't on this branch."
  info "The tag $TAG marks $TAG_COMMIT."
  # The tag's manifest must be this version (a tag on the wrong commit would publish other code).
  TAGGED_VERSION=$(git show "$TAG_COMMIT:$MANIFEST" | node --input-type=commonjs -e \
    'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).version)')
  [[ "$TAGGED_VERSION" == "$VERSION" ]] ||
    problem "At the tag $TAG, $MANIFEST says version $TAGGED_VERSION, not $VERSION."
else
  TAG_COMMIT=""
  problem "There's no tag $TAG. Make the release first (bump, changelog, merge, push the tag)."
fi

# A fixed string, so the dots in the version are dots (^ isn't needed: "## [" starts a section).
if grep -qF "## [$VERSION]" "$DIR/CHANGELOG.md" 2>/dev/null; then
  info "$DIR/CHANGELOG.md has a section for $VERSION."
else
  problem "$DIR/CHANGELOG.md has no '## [$VERSION]' section."
fi

# Only the tag's run of the ci workflow counts, and only when it finished and passed: a push of the
# tag, at the tag's own commit, so a run by hand on a branch named like the tag never passes for it.
if [[ -n "$TAG_COMMIT" ]]; then
  CI=$(gh run list --workflow "$WORKFLOW" --branch "$TAG" --event push --limit 5 \
    --json status,conclusion,headSha \
    --jq "[.[] | select(.headSha == \"$TAG_COMMIT\")][0] | \"\\(.status) \\(.conclusion)\"" 2>/dev/null || true)
  case "$CI" in
    "completed success") info "The $WORKFLOW run for $TAG passed." ;;
    "" | "null null") problem "No $WORKFLOW run found for $TAG." ;;
    *) problem "The $WORKFLOW run for $TAG hasn't passed (${CI% })." ;;
  esac
fi

# ─── Build and check, at the tag's commit ───────────────────────────

WORK=$(mktemp -d)
WORKTREE="$WORK/source"
PACKED="$WORK/packed"
mkdir "$PACKED"
if [[ -n "$TAG_COMMIT" ]]; then
  BUILD_AT="$TAG"
else
  # Only a dry run gets here without a tag: it builds this commit instead, to show the rest.
  BUILD_AT="$HEAD_COMMIT"
  warn "Building this commit instead of the tag, for the dry run."
fi
info "Checking out $BUILD_AT in a temporary worktree..."
# Line endings exactly as committed (LF), whatever this machine's Git says.
git -c core.autocrlf=false -c core.eol=lf worktree add --quiet --detach "$WORKTREE" "$BUILD_AT"
# Chained with &&, not one command per line: inside `( … ) || die`, Bash ignores `set -e`, so a
# failed step would otherwise be followed by the next one and only the last one's status counted.
(
  cd "$WORKTREE" &&
    # No install scripts: building and testing the libraries needs none.
    pnpm install --frozen-lockfile --ignore-scripts &&
    # The package and every workspace package it depends on; a package with no build (the Nuxt
    # layer ships source) is skipped.
    pnpm --filter "$PACKAGE_NAME..." --if-present run build &&
    pnpm --filter "$PACKAGE_NAME" run typecheck &&
    pnpm --filter "$PACKAGE_NAME" run test &&
    cd "$DIR" &&
    pnpm pack --pack-destination "$PACKED" >/dev/null
) || die "The install, build, typecheck, tests, or pack failed at $BUILD_AT."
TARBALL=$(ls "$PACKED"/*.tgz)
info "Built, typechecked, tested, and packed at $BUILD_AT: $(basename "$TARBALL")"

# ─── What's in the package ──────────────────────────────────────────

info "Checking the packed files..."
FILES=$(tar -tzf "$TARBALL" | sed 's#^package/##' | sort)
MISSING=""
for f in $(required_files "$NAME"); do
  grep -qxF "$f" <<<"$FILES" || MISSING="$MISSING $f"
done
[[ -z "$MISSING" ]] || die "The package is missing:$MISSING"
EXTRA=$(grep -E "$FORBIDDEN_RE" <<<"$FILES" || true)
[[ -z "$EXTRA" ]] || die "The package holds files it mustn't:"$'\n'"$EXTRA"

# The packed manifest: its license, and nothing that runs on install. A library has no runtime
# dependencies (peers are fine); the CLI has @frotzinc/zcode and, for --inform, @frotzinc/inform6-wasm,
# each at an exact version that is already on npm (so publish those first).
tar -xzf "$TARBALL" -C "$WORK" package/package.json
node --input-type=commonjs -e '
  const [path, license, name] = process.argv.slice(1);
  const pkg = require(path);
  const bad = [];
  if (pkg.license !== license) bad.push(`license is ${pkg.license}, not ${license}`);
  const deps = pkg.dependencies ?? {};
  if (name === "frotzlens") {
    const allowed = ["@frotzinc/zcode", "@frotzinc/inform6-wasm"];
    const keys = Object.keys(deps);
    if (!keys.includes("@frotzinc/zcode") || keys.some(k => !allowed.includes(k))) bad.push(`dependencies are ${JSON.stringify(deps)}, not @frotzinc/zcode (and @frotzinc/inform6-wasm)`);
    for (const k of keys) if (!/^\d+\.\d+\.\d+$/.test(deps[k])) bad.push(`${k} is "${deps[k]}", not an exact version`);
  } else if (Object.keys(deps).length) bad.push("has dependencies");
  for (const field of ["optionalDependencies", "bundledDependencies"])
    if (pkg[field] && Object.keys(pkg[field]).length) bad.push(`has ${field}`);
  for (const hook of ["preinstall", "install", "postinstall", "prepare"])
    if (pkg.scripts && pkg.scripts[hook]) bad.push(`has a ${hook} script`);
  if (bad.length) { console.error(bad.join("; ")); process.exit(1); }
' "$WORK/package/package.json" "$LICENSE_ID" "$PACKAGE_NAME" || die "The packed package.json isn't publishable as is."
if [[ "$NAME" == cli ]]; then
  while read -r DEP; do
    npm view "$DEP" version >/dev/null 2>&1 ||
      die "The CLI needs $DEP, which isn't on npm yet. Publish it first: ./publish.sh ${DEP%%@[0-9]*}"
  done < <(node --input-type=commonjs -e 'for (const [k, v] of Object.entries(require(process.argv[1]).dependencies)) console.log(`${k}@${v}`)' "$WORK/package/package.json")
fi
info "$(wc -l <<<"$FILES" | tr -d ' ') files, every required one present, none forbidden; $LICENSE_ID, the dependencies it may have, no install scripts."

# ─── Install the real tarball and run it ────────────────────────────

SMOKE="scripts/smoke/$NAME.mjs"
[[ -f "$WORKTREE/$SMOKE" ]] || die "There's no smoke test $SMOKE at $BUILD_AT."
info "Installing the packed tarball in a scratch project..."
SCRATCH="$WORK/scratch"
mkdir "$SCRATCH"
cp "$WORKTREE/$SMOKE" "$SCRATCH/smoke.mjs"
(
  cd "$SCRATCH" &&
    npm init -y >/dev/null &&
    # Peers (nuxt, @nuxt/ui, vue, vitest) aren't installed: the smoke test needs none of them.
    npm install --ignore-scripts --no-audit --no-fund --legacy-peer-deps "$TARBALL" >/dev/null &&
    node smoke.mjs
) || die "The packed tarball didn't install, or its smoke test failed."
info "The packed tarball installs and passes $SMOKE."

# ─── Dry run ────────────────────────────────────────────────────────

NPM_TAG=()
# A pre-release (1.2.3-rc.1) goes out as `next`, never as what a plain install gets.
[[ "$VERSION" == *-* ]] && NPM_TAG=(--tag next)

info "npm publish --dry-run..."
npm publish "$TARBALL" --dry-run --access public --ignore-scripts ${NPM_TAG[@]+"${NPM_TAG[@]}"}

# What's in the release, and who made it: the package's own commits since its previous release,
# shown by a dry run as well as a publish. A commit's author and subject are anyone's words, so a
# control character in them is shown as an escape.
TO="${TAG_COMMIT:-$HEAD_COMMIT}"
PREVIOUS=$(git describe --tags --abbrev=0 --match "$PACKAGE_NAME@*" "$TO^" 2>/dev/null || true)
if [[ -n "$PREVIOUS" ]]; then
  info "The commits to $DIR since $PREVIOUS, and who made them:"
  RANGE="$PREVIOUS..$TO"
else
  info "The commits to $DIR (its first release), and who made them:"
  RANGE="$TO"
fi
git log --format='  %h  %an  %s' "$RANGE" -- "$DIR" |
  node --input-type=commonjs -e '
    const text = require("fs").readFileSync(0, "utf8");
    const shown = (c) => "\\u{" + c.codePointAt(0).toString(16) + "}";
    process.stdout.write(text.replace(/(?![\n\t])[\p{Cc}\p{Cf}\u{2028}\u{2029}]/gu, shown));
  '

if [[ "$DRY_RUN" == true ]]; then
  info "Dry run complete. Nothing was published or changed."
  exit 0
fi

# ─── Confirm ────────────────────────────────────────────────────────

echo ""
if [[ "$FIRST_TIME" == true ]]; then
  warn "About to publish $PACKAGE_NAME@$VERSION (FIRST TIME, public)."
else
  warn "About to publish $PACKAGE_NAME@$VERSION."
fi
read -r -p "To publish it, type the version ($VERSION): " REPLY || REPLY=""
[[ "$REPLY" == "$VERSION" ]] || {
  info "Aborted. Nothing was published."
  exit 0
}

# ─── Publish ────────────────────────────────────────────────────────

# npm approves every publish itself, after every check and the typed version: it prints a link to
# open in a browser on any device (or, for some accounts, asks for its code here), and waits.
[[ -t 0 && -t 1 ]] ||
  die "npm can only show its approval link in a terminal, so nothing was published. Run ./publish.sh in a terminal (in Git Bash on Windows, under winpty or in Windows Terminal)."
info "npm will now ask you to approve this: open its link, or type its code."
# The tarball that was installed and run above, not a new one packed from the folder.
npm publish "$TARBALL" --access public --ignore-scripts --auth-type=web ${NPM_TAG[@]+"${NPM_TAG[@]}"}

# npm publish exited 0, so the release is published (a failed publish stopped the script above).
# The registry can take 5 to 10 minutes to list a new version: ask every 20 seconds for up to 15
# minutes, saying so each minute. If it still isn't listed, that's a warning, never a failure.
POLL_SECONDS=20
POLL_FOR_SECONDS=900
listed() {
  [[ "$(npm view "$PACKAGE_NAME@$VERSION" version 2>/dev/null || true)" == "$VERSION" ]]
}
waited=0
until listed; do
  if ((waited >= POLL_FOR_SECONDS)); then
    echo ""
    warn "npm accepted the publish, but doesn't list it yet; that can take a while. Check https://www.npmjs.com/package/$PACKAGE_NAME later. Don't run ./publish.sh again for this version."
    exit 0
  fi
  if ((waited % 60 == 0)); then
    info "Published. Waiting for npm to list it (this can take 5–10 minutes)…"
  fi
  sleep "$POLL_SECONDS"
  waited=$((waited + POLL_SECONDS))
done

echo ""
info "Published $PACKAGE_NAME@$VERSION."
info "npm: https://www.npmjs.com/package/$PACKAGE_NAME"
