#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Prime merge. Dry-run by default; never force-pushes; never pushes the base branch.
#   prime-merge.sh                 dry-run: show what would happen and why it would refuse
#   prime-merge.sh --apply         rebase on base -> gate -> check review -> merge --no-ff into local base
#   prime-merge.sh --apply --pr    rebase -> gate -> check review -> push feature branch -> gh pr create --draft
# Options: --base <ref>  --no-rebase  --allow-empty-gate  --ignore-order (skip plan dependsOn check)
# Exit: 0 ok, 1 gate failed, 2 usage, 3 refused (review/state), 4 conflict (hand to Codex), 5 stale review
set -uo pipefail
PRIME_TAG=prime-merge
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib/prime-common.sh"

APPLY=0; PR=0; BASE_ARG=""; ALLOW_EMPTY=0; IGNORE_ORDER=0; NO_REBASE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --pr) PR=1; shift ;;
    --base) prime_need_val "$@"; BASE_ARG="$2"; shift 2 ;;
    --allow-empty-gate) ALLOW_EMPTY=1; shift ;;
    --ignore-order) IGNORE_ORDER=1; shift ;;
    --no-rebase) NO_REBASE=1; shift ;;
    -h|--help) sed -n '3,8p' "$0"; exit 0 ;;
    *) prime_die "unknown arg: $1" 2 ;;
  esac
done

prime_require_repo
branch="$(git rev-parse --abbrev-ref HEAD)"
prime_protected_branch "$branch" && prime_die "on '$branch': run from the feature branch worktree" 3
git fetch --quiet origin 2>/dev/null || prime_warn "fetch failed; using local refs"
base="$(prime_pick_base "$BASE_ARG")" || exit
base_local="${base#origin/}"
main_wt="$(git worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}')"
if command -v node >/dev/null 2>&1; then
  integration="$(node -e 'const fs=require("fs");let p;try{p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"))}catch{};if(p?.integration&&p.streams?.some(s=>"feature/"+s.slug===process.argv[2]))console.log(p.integration)' "$main_wt/.prime/plan.json" "$branch")"
  if [ -n "$integration" ] && [ "$base" != "$integration" ]; then
    prime_ledger merge result=refused reason=base-not-integration
    prime_die "base-not-integration: plan streams must merge into $integration" 3
  fi
fi
sd="$(prime_state_dir)"
review="$sd/review.json"
verdict="$(prime_json_get "$review" verdict)"
reviewed_patch="$(prime_json_get "$review" patch_id)"

if git merge-base --is-ancestor "$base" HEAD; then need_rebase=0; else need_rebase=1; fi

prime_log "branch=$branch base=$base mode=$([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)$([ $PR -eq 1 ] && echo ' +PR')"
prime_log "review=${verdict:-none} rebase_needed=$([ $need_rebase -eq 1 ] && echo yes || echo no) clean=$(prime_is_clean && echo yes || echo no)"

refuse=""
[ "$verdict" = "APPROVE" ] || refuse="no APPROVE review recorded (run /prime-review)"
prime_is_clean || refuse="${refuse:+$refuse; }uncommitted changes"
# Plan order: every stream this one dependsOn must already be merged into base.
if [ "$IGNORE_ORDER" -eq 0 ] && command -v node >/dev/null 2>&1; then
  deps_out="$(node "$HERE/prime-plan.mjs" deps-merged --branch "$branch" --base "$base" 2>&1)"; deps_rc=$?
  [ "$deps_rc" -eq 3 ] && refuse="${refuse:+$refuse; }$deps_out"
fi
scan_out="$(node "$HERE/prime-plan.mjs" scan --base "$base" 2>&1)"; scan_rc=$?
if [ "$scan_rc" -ne 0 ]; then
  prime_ledger merge result=refused reason=secret-scan
  [ -n "$scan_out" ] && prime_log "$scan_out"
  prime_die "secret-scan refused (exit $scan_rc)" 3
fi

if [ "$APPLY" -eq 0 ]; then
  prime_log "plan:"
  if [ $need_rebase -eq 1 ]; then
    if [ $NO_REBASE -eq 1 ]; then prime_log "  1. base moved: merge $base into this branch (no rebase), then review again"
    else prime_log "  1. git rebase $base (conflicts -> Codex, then /prime-review again)"; fi
  fi
  prime_log "  2. prime-gate.sh on the rebased tree"
  prime_log "  3. check review patch-id still matches (else re-review)"
  if [ $PR -eq 1 ]; then prime_log "  4. git push -u origin $branch (no force) + gh pr create --draft --base $base_local"
  else prime_log "  4. merge --no-ff $branch into local $base_local (not pushed)"; fi
  if [ -n "$refuse" ]; then prime_log "WOULD REFUSE: $refuse"; prime_ledger merge.dryrun result=refused "reason=$refuse"; exit 3; fi
  prime_log "ready; re-run with --apply"; exit 0
fi

[ -n "$refuse" ] && { prime_ledger merge result=refused "reason=$refuse"; prime_die "refusing: $refuse" 3; }
if [ $need_rebase -eq 1 ] && [ $NO_REBASE -eq 1 ]; then
  prime_ledger merge result=conflict stage=base-moved
  prime_die "base moved: merge $base into this branch (no rebase), then review again" 4
fi
pid="$(prime_patch_id "$base")" || prime_die "cannot fingerprint the branch" 1
[ "$pid" = "$reviewed_patch" ] \
  || { prime_ledger merge result=stale_review; prime_die "changes differ from what was reviewed (new commits since review). Re-run /prime-review." 5; }

if [ $need_rebase -eq 1 ]; then
  prime_log "rebasing onto $base"
  if ! git rebase --quiet "$base"; then
    prime_warn "rebase conflict. Hand to the codex agent: resolve, git rebase --continue, then /prime-review again."
    prime_warn "To back out: git rebase --abort"
    prime_ledger merge result=conflict stage=rebase
    exit 4
  fi
fi
git merge-base --is-ancestor "$base" HEAD || prime_die "branch still not based on $base" 3

now_patch="$(prime_patch_id "$base")" || prime_die "cannot fingerprint the branch" 1
if [ "$now_patch" != "$reviewed_patch" ]; then
  prime_die "changes differ from what was reviewed (new commits or conflict edits). Re-run /prime-review." 5
fi
if [ $need_rebase -eq 1 ]; then
  scan_out="$(node "$HERE/prime-plan.mjs" scan --base "$base" 2>&1)"; scan_rc=$?
  if [ "$scan_rc" -ne 0 ]; then
    prime_ledger merge result=refused reason=secret-scan
    [ -n "$scan_out" ] && prime_log "$scan_out"
    prime_die "secret-scan refused (exit $scan_rc)" 3
  fi
fi

"$HERE/prime-gate.sh"; g=$?
if [ $g -eq 2 ] && [ $ALLOW_EMPTY -eq 0 ]; then prime_die "gate ran no checks; pass --allow-empty-gate if that is intended" 1; fi
[ $g -eq 1 ] && { prime_ledger merge result=gate_failed; prime_die "gate failed on the rebased tree" 1; }

if [ $PR -eq 1 ]; then
  command -v gh >/dev/null 2>&1 || prime_die "gh not installed" 3
  if ! git push -u origin "$branch"; then
    prime_die "push rejected (branch was rewritten by rebase?). Not forcing. Push a new branch name or resolve manually." 3
  fi
  gh pr create --draft --base "$base_local" --head "$branch" --fill || prime_die "gh pr create failed" 3
  prime_ledger merge result=draft_pr "base=$base_local"
  prime_log "draft PR opened; merge happens on GitHub after review"
  exit 0
fi

# Merge into local base. Prefer the worktree that already has base checked out.
base_wt="$(git worktree list --porcelain | awk -v b="refs/heads/$base_local" '
  /^worktree /{p=substr($0,10)} $0=="branch " b {print p; exit}')"
tmp_wt=""
if [ -z "$base_wt" ]; then
  git rev-parse --verify --quiet "refs/heads/$base_local" >/dev/null || git branch "$base_local" "$base"
  tmp_wt="$(mktemp -d "${TMPDIR:-/tmp}/prime-merge.XXXXXX")"
  git worktree add --quiet "$tmp_wt" "$base_local" || prime_die "could not check out $base_local" 3
  base_wt="$tmp_wt"
fi
cleanup_tmp() { [ -n "$tmp_wt" ] && git worktree remove "$tmp_wt" >/dev/null 2>&1; }

prime_is_clean "$base_wt" || { cleanup_tmp; prime_die "$base_wt has uncommitted changes" 3; }
if [ "$base" != "$base_local" ]; then
  git -C "$base_wt" merge --quiet --ff-only "$base" 2>/dev/null \
    || { cleanup_tmp; prime_die "local $base_local has diverged from $base; sync it first (no force)" 3; }
fi
if ! git -C "$base_wt" merge --no-ff --no-edit -m "Merge $branch (prime gate + review passed)" "$branch"; then
  git -C "$base_wt" merge --abort >/dev/null 2>&1
  cleanup_tmp
  prime_die "merge conflict on $base_local; aborted. Hand to codex, then /prime-review again." 4
fi
cleanup_tmp
# The plan stream merged here, so a later plan that reuses the slug is not taken as merged.
stream="$(node "$HERE/prime-plan.mjs" stream-id --branch "$branch" 2>/dev/null)" || stream=""
prime_ledger merge result=merged "base=$base_local" "head=$(git rev-parse HEAD)" "stream=$stream"
prime_log "merged $branch into local $base_local at $(git rev-parse --short "refs/heads/$base_local")"
prime_log "not pushed. To publish: git push origin $base_local (never --force)"
prime_log "afterwards: /prime-cleanup to remove the merged worktree"
