#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Record the prime-reviewer verdict for the current branch state.
# usage: prime-review-record.sh APPROVE|REQUEST_CHANGES|BLOCK [--base <ref>] [--note "text"]
set -euo pipefail
PRIME_TAG=prime-review
. "$(cd "$(dirname "$0")" && pwd)/lib/prime-common.sh"

verdict="${1:-}"; shift || true
case "$verdict" in APPROVE|REQUEST_CHANGES|BLOCK) ;; *)
  echo "usage: prime-review-record.sh APPROVE|REQUEST_CHANGES|BLOCK [--base <ref>] [--note text]" >&2; exit 2 ;; esac
base_arg=""; note=""
while [ $# -gt 0 ]; do
  case "$1" in
    --base) prime_need_val "$@"; base_arg="$2"; shift 2 ;;
    --note) prime_need_val "$@"; note="$2"; shift 2 ;;
    *) prime_die "unknown arg: $1" 2 ;;
  esac
done

prime_require_repo
prime_is_clean || prime_die "uncommitted changes: commit first so the review matches what will merge"
base="$(prime_pick_base "$base_arg")" || exit
sd="$(prime_state_dir)"
pid="$(prime_patch_id "$base")"
cat > "$sd/review.json" <<JSON
{
  "verdict": "$verdict",
  "branch": "$(git rev-parse --abbrev-ref HEAD)",
  "head": "$(git rev-parse HEAD)",
  "base": "$base",
  "patch_id": "$pid",
  "at": "$(prime_now)",
  "note": "$(prime_json_escape "$note")"
}
JSON
prime_ledger review "verdict=$verdict" "head=$(git rev-parse --short HEAD)"
prime_log "recorded $verdict for $(git rev-parse --short HEAD) (base $base)"
