#!/usr/bin/env bash
# CogMesh — publish setup: fill in the placeholders the maintainer must set before going public.
#
#   ./scripts/setup-publish.sh <github-handle> [repo-name] [licensing-contact]
#
# Examples:
#   ./scripts/setup-publish.sh realvibearchitect
#   ./scripts/setup-publish.sh realvibearchitect cogmesh
#   ./scripts/setup-publish.sh realvibearchitect cogmesh-agi "license@example.com"
#
# What it replaces (across README.md, README.ko.md, package.json, CHANGELOG.md, RELEASE_NOTES_*.md):
#   <your-id>                                  → your GitHub handle
#   the repo name in github URLs (default cogmesh, override with the 2nd arg)
#   the licensing-contact placeholder in the READMEs (only if you pass the 3rd arg)
#
# It is idempotent-ish: run it once. After it runs, grep for any remaining "<your-id>" to confirm.
# It does NOT commit — review `git diff` first, then commit yourself.

set -euo pipefail

HANDLE="${1:-}"
REPO="${2:-cogmesh}"
CONTACT="${3:-}"

if [ -z "$HANDLE" ]; then
  echo "usage: $0 <github-handle> [repo-name] [licensing-contact]" >&2
  echo "  e.g. $0 realvibearchitect cogmesh \"license@example.com\"" >&2
  exit 1
fi

# resolve repo root regardless of where the script is called from
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FILES=(README.md README.ko.md package.json CHANGELOG.md)
# include any release-notes files that exist
for f in RELEASE_NOTES_*.md; do [ -e "$f" ] && FILES+=("$f"); done

echo "→ repo root: $ROOT"
echo "→ handle:    $HANDLE"
echo "→ repo name: $REPO"
[ -n "$CONTACT" ] && echo "→ contact:   $CONTACT" || echo "→ contact:   (left as placeholder — pass a 3rd arg to set it)"
echo

# portable in-place sed (GNU and BSD/macOS differ on -i)
sed_i() { if sed --version >/dev/null 2>&1; then sed -i "$@"; else sed -i '' "$@"; fi; }

for f in "${FILES[@]}"; do
  [ -e "$f" ] || continue
  # 1) repo name inside github URLs: .../<your-id>/cogmesh... → .../<your-id>/<repo>...
  #    (do this BEFORE substituting <your-id> so the anchor is still present)
  if [ "$REPO" != "cogmesh" ]; then
    sed_i "s#<your-id>/cogmesh#<your-id>/${REPO}#g" "$f"
  fi
  # 2) the handle itself
  sed_i "s#<your-id>#${HANDLE}#g" "$f"
  # 3) licensing contact, only when provided
  if [ -n "$CONTACT" ]; then
    sed_i "s#\[ your licensing email / URL here \]#${CONTACT}#g" "$f"
  fi
  echo "  ✔ updated $f"
done

# also fix the clone URL example inside the release notes (uses the real https URL form)
for f in RELEASE_NOTES_*.md; do
  [ -e "$f" ] || continue
done

echo
echo "Done. Now verify and commit:"
echo "  grep -rn '<your-id>' . --exclude-dir=node_modules --exclude-dir=.git   # should be empty"
if [ -z "$CONTACT" ]; then
  echo "  # (licensing contact still a placeholder — edit the READMEs by hand, or re-run with a 3rd arg)"
fi
echo "  npm run lint && npm test        # sanity-check nothing broke"
echo "  git add -A && git diff --cached  # review"
echo "  git commit -m 'chore: set repository URLs and contact for publication'"
