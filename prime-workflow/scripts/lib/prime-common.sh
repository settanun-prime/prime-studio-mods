# shellcheck shell=bash
# Shared helpers for Prime scripts. Bash 3.2 compatible (macOS /bin/bash).

prime_log()  { printf '[%s] %s\n' "${PRIME_TAG:-prime}" "$*"; }
prime_warn() { printf '[%s] WARN: %s\n' "${PRIME_TAG:-prime}" "$*" >&2; }
prime_die()  { printf '[%s] ERROR: %s\n' "${PRIME_TAG:-prime}" "$1" >&2; exit "${2:-1}"; }
# In an option loop: prime_need_val "$@" before reading $2 (a bare `shift 2` with one arg left loops forever).
prime_need_val() { [ "$#" -ge 2 ] || prime_die "$1 needs a value" 2; }

prime_require_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || prime_die "not inside a git repo" 2
}

# Per-worktree state lives inside the worktree's own git dir, never in the work tree.
prime_state_dir() {
  local d
  d="$(git rev-parse --absolute-git-dir)/prime"
  mkdir -p "$d"
  printf '%s' "$d"
}

# Base branch: --base / PRIME_BASE / PRIME_BASE, else first existing of origin/dev origin/main dev main master.
prime_pick_base() {
  local override="${1:-${PRIME_BASE:-}}" ref
  if [ -n "$override" ]; then
    case "$override" in *[!A-Za-z0-9._/-]*) prime_die "base '$override' must be a plain branch name" 2 ;; esac
    git rev-parse --verify --quiet "$override" >/dev/null || prime_die "base '$override' not found"
    printf '%s' "$override"; return
  fi
  for ref in origin/dev origin/main dev main master; do
    if git rev-parse --verify --quiet "$ref" >/dev/null; then printf '%s' "$ref"; return; fi
  done
  prime_die "no base branch found (tried origin/dev origin/main dev main master)"
}

# Fingerprint of the branch's changes relative to base. It ignores line numbers, so a review survives a
# clean rebase, but not whitespace (--verbatim, git 2.39+): indentation can change what code does.
prime_patch_id() {
  local base="$1" mb out
  mb="$(git merge-base "$base" HEAD)" || return 1
  out="$(git diff "$mb" HEAD | git patch-id --verbatim)" || { prime_warn "git patch-id --verbatim failed (needs git 2.39+)"; return 1; }
  printf '%s' "${out%% *}"
}

prime_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Read a flat "key": "value" string from our own one-key-per-line JSON files.
prime_json_get() {
  [ -f "$1" ] || return 0
  sed -n "s/^[[:space:]]*\"$2\":[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$1" | head -n 1
}

# Dotted path from JSON on stdin (herdr replies): herdr ... | prime_jget result.tab.tab_id
prime_jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let v;try{v=JSON.parse(s)}catch{process.exit(1)}for(const k of process.argv[1].split("."))v=v?.[k];if(v==null)process.exit(1);console.log(v)})' "$1"; }

prime_json_escape() { printf '%s' "$1" | tr '\n\r\t' '   ' | sed 's/\\/\\\\/g; s/"/\\"/g'; }

prime_is_clean() {  # tracked changes only; untracked files do not block
  [ -z "$(git -C "${1:-.}" status --porcelain --untracked-files=no)" ]
}

prime_protected_branch() {
  case "$1" in main|master|dev|develop|HEAD) return 0 ;; *) return 1 ;; esac
}

# Never let git block on a credential prompt inside an agent run.
export GIT_TERMINAL_PROMPT=0

# Repo-wide Prime dir shared by all worktrees (<common-git-dir>/prime).
prime_common_dir() {
  local c
  c="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
    || c="$(cd "$(git rev-parse --git-common-dir)" && pwd)"
  mkdir -p "$c/prime"
  printf '%s' "$c/prime"
}

# Append one JSON line to the run ledger: prime_ledger <event> [key=value ...]
# Values are strings unless they are plain integers. Disabled with PRIME_LEDGER=0 / PRIME_LEDGER=0.
prime_ledger() {
  [ "${PRIME_LEDGER:-${PRIME_LEDGER:-1}}" = 0 ] && return 0
  git rev-parse --git-dir >/dev/null 2>&1 || return 0
  local ev="$1" kv k v line br
  shift
  br="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  line="{\"ts\":\"$(prime_now)\",\"event\":\"$(prime_json_escape "$ev")\",\"branch\":\"$(prime_json_escape "$br")\""
  for kv in "$@"; do
    k="${kv%%=*}"; v="${kv#*=}"
    case "$v" in
      ''|*[!0-9]*|0?*) line="$line,\"$k\":\"$(prime_json_escape "$v")\"" ;;  # JSON numbers have no leading zero (short shas like 0123456)
      *) line="$line,\"$k\":$v" ;;
    esac
  done
  printf '%s}\n' "$line" >> "$(prime_common_dir)/runs.jsonl"
}

# Run a command with a time limit (portable; no coreutils timeout on macOS).
# Returns the command's exit code, or 124 on timeout.
prime_run_timeout() {
  local ticks=$(( $1 * 5 )) pid i=0 rc
  shift
  "$@" &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$i" -ge "$ticks" ]; then
      kill -TERM "$pid" 2>/dev/null; sleep 1; kill -KILL "$pid" 2>/dev/null
      wait "$pid" 2>/dev/null
      return 124
    fi
    sleep 0.2; i=$((i + 1))
  done
  wait "$pid"; rc=$?
  return "$rc"
}

# Integer from the plugin's prime.config.json: prime_cfg_int <key> <default>
prime_cfg_int() {
  local root cfg v
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cfg="$root/prime.config.json"
  [ -f "$cfg" ] || cfg="$root/prime.config.json"
  v="$(sed -n "s/.*\"$1\":[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p" "$cfg" 2>/dev/null | head -n 1)"
  printf '%s' "${v:-$2}"
}

# Value or array from the plugin's prime.config.json, one item per line: prime_cfg_list team.claudeArgs
prime_cfg_list() {
  local root cfg
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cfg="$root/prime.config.json"
  [ -f "$cfg" ] || cfg="$root/prime.config.json"
  node -e 'let v=require(process.argv[1]);for(const k of process.argv[2].split("."))v=v?.[k];for(const x of [].concat(v??[]))console.log(x)' \
    "$cfg" "$1"
}

# Model or effort for an op role from /setup-op, empty until it has been run: prime_op <role> model|effort
prime_op() { node "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/op-config.mjs" get "$1" "$2" || true; }
