#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Prime run ledger (<common-git-dir>/prime/runs.jsonl). Scripts append gate/review/merge/worktree/cleanup
# events automatically; prime-team.sh records each teammate run itself. Add an agent run by hand with:
#   prime-ledger.sh agent <role> --turns N [--status ok|partial|failed] [--note text]
#   prime-ledger.sh decision "<what was chosen>" --why "<evidence>"   the /op-mode decision trail
#   prime-ledger.sh tail [N]        print the last N events (default 20)
#   prime-ledger.sh path            print the ledger path
# Exit: 0 ok, 2 usage
set -uo pipefail
PRIME_TAG=prime-ledger
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib/prime-common.sh"
prime_require_repo
case "${1:-}" in
  agent)
    role="${2:-}"; shift 2 || true
    [ -f "$HERE/../agents/$role.md" ] || prime_die "unknown role '$role' (see agents/)" 2
    turns=""; status=ok; note=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --turns) prime_need_val "$@"; turns="$2"; shift 2 ;;
        --status) prime_need_val "$@"; status="$2"; shift 2 ;;
        --note) prime_need_val "$@"; note="$2"; shift 2 ;;
        *) prime_die "unknown arg: $1" 2 ;;
      esac
    done
    case "$turns" in ''|*[!0-9]*) prime_die "--turns <integer> required" 2 ;; esac
    turns=$((10#$turns))
    case "$status" in ok|partial|failed) ;; *) prime_die "--status must be ok, partial or failed" 2 ;; esac
    prime_ledger agent "role=$role" "turns=$turns" "status=$status" "note=$note"
    prime_log "recorded $role: $turns turns ($status)" ;;
  decision)
    choice="${2:-}"; shift 2 || true
    [ -n "$choice" ] || prime_die 'usage: decision "<what was chosen>" --why "<evidence>"' 2
    why=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --why) prime_need_val "$@"; why="$2"; shift 2 ;;
        *) prime_die "unknown arg: $1" 2 ;;
      esac
    done
    [ -n "$why" ] || prime_die "--why <evidence> required: a decision without its reason is not reviewable" 2
    prime_ledger decision "choice=$choice" "why=$why"
    prime_log "recorded decision: $choice" ;;
  tail) tail -n "${2:-20}" "$(prime_common_dir)/runs.jsonl" 2>/dev/null || true ;;
  path) printf '%s\n' "$(prime_common_dir)/runs.jsonl" ;;
  *) sed -n '2,9p' "$0"; exit 2 ;;
esac
