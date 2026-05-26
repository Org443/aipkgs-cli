#!/usr/bin/env bash
# Publish every aipkg under aipkgs/.
# Finds every aipkg.json, cd's into its directory, and runs `aipkg publish`,
# sleeping 6 seconds between packages. Continues on failure and prints a
# summary at the end.
#
# Usage:
#   scripts/publish-all.sh                  # publish everything under aipkgs/
#   scripts/publish-all.sh --dry-run        # show what would be published
#   scripts/publish-all.sh aipkgs/caveman   # restrict to one or more roots

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SLEEP_SECONDS=6

DRY_RUN=0
ROOTS=()
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,11p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *) ROOTS+=("$arg") ;;
  esac
done

if [ "${#ROOTS[@]}" -eq 0 ]; then
  ROOTS=("aipkgs")
fi

PKGS=()
for root in "${ROOTS[@]}"; do
  root_path="$REPO_ROOT/$root"
  if [ ! -d "$root_path" ]; then
    echo "warning: $root_path does not exist, skipping" >&2
    continue
  fi
  while IFS= read -r -d '' manifest; do
    PKGS+=("$(dirname "$manifest")")
  done < <(find "$root_path" -name aipkg.json -not -path '*/node_modules/*' -print0 | sort -z)
done

if [ "${#PKGS[@]}" -eq 0 ]; then
  echo "No aipkg.json files found under: ${ROOTS[*]}"
  exit 0
fi

echo "Found ${#PKGS[@]} package(s) to publish:"
for dir in "${PKGS[@]}"; do
  echo "  - ${dir#$REPO_ROOT/}"
done
echo

SUCCESS=()
FAILED=()
TOTAL=${#PKGS[@]}
for i in "${!PKGS[@]}"; do
  dir="${PKGS[$i]}"
  rel="${dir#$REPO_ROOT/}"
  echo "==> publishing $rel"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "    (dry run) would run: aipkg publish"
    SUCCESS+=("$rel")
    continue
  fi
  if ( cd "$dir" && aipkg publish ); then
    SUCCESS+=("$rel")
  else
    code=$?
    echo "    failed (exit $code)" >&2
    FAILED+=("$rel")
  fi
  echo
  if [ "$((i + 1))" -lt "$TOTAL" ]; then
    sleep "$SLEEP_SECONDS"
  fi
done

echo "----------------------------------------"
echo "Published: ${#SUCCESS[@]}"
for p in "${SUCCESS[@]}"; do echo "  ok   $p"; done
if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "Failed: ${#FAILED[@]}"
  for p in "${FAILED[@]}"; do echo "  fail $p"; done
  exit 1
fi
