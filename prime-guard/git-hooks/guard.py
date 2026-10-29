"""prime-guard git hooks: machine-wide guard: keeps personal and network data of this PC out of pushed commits.

Usage (called by the hooks in ./hooks):
  guard.py pre-push <remote> <url>   reads ref lines on stdin, blocks on a hit (exit 1)
  guard.py pre-commit                scans the staged diff, warns only (exit 0)
  guard.py report <repo>...          scans commits not on any remote, prints kinds and counts only
Real values are never printed in full.
"""
import ipaddress
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter

ZERO = "0" * 40
ALLOW_FILE = ".guard-allow"  # per repo, at the top level: one regex per line, matched against the found value

# ---- layer 1: patterns that are never placeholders ----
PATTERNS = [
    ("private-key", re.compile(r"-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----")),
    ("aws-key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("github-token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b")),
    ("slack-token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
    ("google-key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("ai-api-key", re.compile(r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}")),
    ("stripe-key", re.compile(r"\b[sr]k_live_[0-9A-Za-z]{24,}")),
    ("telegram-bot-token", re.compile(r"\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b")),
    ("tailscale-authkey", re.compile(r"\btskey-[a-z]+-[A-Za-z0-9-]{10,}")),
    ("tailscale-ipv4", re.compile(r"(?<![\d.])100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}(?![\d])")),
    ("tailscale-ipv6", re.compile(r"(?i)\bfd7a:115c:a1e0:[0-9a-f:]*[0-9a-f]")),
    ("hardware-mac", re.compile(r"(?i)\b[0-9a-f]{2}(?:[-:][0-9a-f]{2}){5}\b")),
    ("windows-profile-path", re.compile(r"(?i)\b[a-z]:(?:\\\\|\\|/)+Users(?:\\\\|\\|/)+([^\\/\s\"'<>|:*?`]+)")),
    ("windows-sid", re.compile(r"\bS-1-5-21-\d+-\d+-\d+(?:-\d+)?\b")),
]
PLACEHOLDER_USERS = {"public", "default", "default user", "all users", "user", "username", "you", "me", "name",
                     "yourname", "your-name", "your_name", "xxx", "example", "runneradmin", "someone", "admin"}
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
EMAIL_OK = re.compile(
    r"(?i)(@users\.noreply\.github\.com|^(no-?reply|git)@|@(example\.(com|org|net)|[\w.-]+\.(example|test|invalid|local|localhost|internal)|localhost)$"
    r"|\.(png|jpe?g|gif|svg|webp|ico|js|mjs|ts|css|json|md)$)")


def pattern_ok(kind, m):
    v = m.group(0)
    if kind == "tailscale-ipv4":
        return v.startswith("100.64.0.")
    if kind == "tailscale-ipv6":
        return re.fullmatch(r"(?i)fd7a:115c:a1e0::[0-9a-f]{1,3}", v) is not None
    if kind == "hardware-mac":
        # test MACs set the locally administered bit; zero, broadcast and IPv4 multicast are not hardware
        return bool(int(v[:2], 16) & 2) or re.fullmatch(r"(?i)(00[-:]){5}00|(ff[-:]){5}ff|01[-:]00[-:]5e.*", v) is not None
    if kind == "windows-profile-path":
        u = m.group(1).strip().lower()
        return u in PLACEHOLDER_USERS or u[0] in "<%${[" or u.startswith("your")
    return False


# ---- layer 2: this machine's real identifiers, read at run time ----
def run(cmd, timeout=20):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout).stdout
    except (OSError, subprocess.SubprocessError):
        return ""


PS = r"""
$o = @{ ip = @(); mac = @(); nip = @(); nmac = @(); gw = @() }
$o.ip = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | ForEach-Object IPAddress)
$o.mac = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object MacAddress | ForEach-Object MacAddress)
$n = @(Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.State -ne 'Unreachable' -and $_.LinkLayerAddress })
$o.nip = @($n | ForEach-Object IPAddress); $o.nmac = @($n | ForEach-Object LinkLayerAddress)
$o.gw = @(Get-NetRoute -DestinationPrefix 0.0.0.0/0 -ErrorAction SilentlyContinue | ForEach-Object NextHop)
$o | ConvertTo-Json -Compress
"""


def lan_ip(v):
    try:
        a = ipaddress.ip_address(v)
    except ValueError:
        return False
    return a.version == 4 and not (a.is_loopback or a.is_link_local or a.is_multicast or a.is_unspecified) \
        and not v.endswith(".255") and not v.startswith("100.")  # tailnet is layer 1 / tailscale below


def machine_values(network=True):
    """[(kind, value)] of real identifiers; empty where a source does not exist.
    network=False skips the ~2-4 s PowerShell query (LAN IPs and MACs) to keep pre-commit light."""
    vals = []
    try:
        net = json.loads(run(["powershell", "-NoProfile", "-NonInteractive", "-Command", PS]) or "{}") if network else {}
    except ValueError:
        net = {}
    gws = set(net.get("gw") or [])
    vals += [("lan-ip", v) for v in net.get("ip") or [] if lan_ip(v) and v not in gws]
    vals += [("lan-neighbor-ip", v) for v in net.get("nip") or [] if lan_ip(v) and v not in gws]
    for kind, key in (("adapter-mac", "mac"), ("arp-mac", "nmac")):
        for v in net.get(key) or []:
            v = v.upper().replace(":", "-")
            if re.fullmatch(r"[0-9A-F]{2}(-[0-9A-F]{2}){5}", v) and not re.fullmatch(r"(00-){5}00|(FF-){5}FF|01-00-5E.*|33-33.*", v):
                vals.append((kind, v))

    cfg = os.path.join(os.path.expanduser("~"), ".ssh", "config")
    if os.path.isfile(cfg):
        with open(cfg, encoding="utf-8", errors="replace") as f:
            for line in f:
                m = re.match(r"\s*(Host|HostName)\s+(.+)", line, re.I)
                for v in (m.group(2).split() if m else []):
                    if len(v) >= 4 and not re.search(r"[*?!]", v):
                        vals.append(("ssh-host", v))

    ts = shutil.which("tailscale") or r"C:\Program Files\Tailscale\tailscale.exe"
    try:
        st = json.loads(run([ts, "status", "--json"]) or "{}")
    except ValueError:
        st = {}
    nodes = [st.get("Self") or {}] + list((st.get("Peer") or {}).values())
    for n in nodes:
        vals += [("tailscale-ip", ip) for ip in n.get("TailscaleIPs") or []]
        for name in (n.get("HostName"), (n.get("DNSName") or "").split(".")[0]):
            if name and len(name) >= 4 and name.lower() != "localhost":
                vals.append(("tailscale-node", name))
    vals += [("tailscale-login", u.get("LoginName")) for u in (st.get("User") or {}).values() if u.get("LoginName")]
    suffix = st.get("MagicDNSSuffix") or ((st.get("CurrentTailnet") or {}).get("MagicDNSSuffix"))
    if suffix:
        vals.append(("tailnet-name", suffix))

    user = os.environ.get("USERNAME", "")
    if len(user) >= 4:
        vals.append(("windows-user", user))
    seen, out = set(), []
    for k, v in vals:
        if v.lower() not in seen:
            seen.add(v.lower())
            out.append((k, v))
    return out


def compile_values(vals):
    rx = []
    for kind, v in vals:
        body = re.escape(v)
        if kind in ("adapter-mac", "arp-mac"):  # same MAC written with ':' or '-'
            body = re.escape(v).replace(r"\-", "[-:]")
        rx.append((kind, re.compile(r"(?<![\w.-])" + body + r"(?![\w-]|\.\d)", re.I)))
    return rx


# ---- scanning ----
def mask(v):
    v = v.strip()
    return f"{v[:2]}***({len(v)} chars)" if len(v) > 4 else f"***({len(v)} chars)"


def load_allow(repo):
    """Regexes from the repo's .guard-allow plus the machine-wide ~/.git-guard-allow (outside the plugin, so updates keep it)."""
    out = []
    for path in (os.path.join(repo, ALLOW_FILE), os.path.join(os.path.expanduser("~"), ".git-guard-allow")):
        if os.path.isfile(path):
            with open(path, encoding="utf-8", errors="replace") as f:
                out += [re.compile(l.strip()) for l in f if l.strip() and not l.lstrip().startswith("#")]
    return out


def scan_line(text, real_rx):
    for kind, rx in PATTERNS:
        for m in rx.finditer(text):
            if not pattern_ok(kind, m):
                yield kind, m.group(0)
    for m in EMAIL.finditer(text):
        if not EMAIL_OK.search(m.group(0)):
            yield "email", m.group(0)
    for kind, rx in real_rx:
        for m in rx.finditer(text):
            yield kind, m.group(0)


def scan_patch(patch, real_rx, allow):
    """Yield (where, kind, value) for each hit in `git log -p --format=...` or `git diff` output."""
    commit, path, line, in_msg, msg_no = "", "", 0, False, 0
    for raw in patch.splitlines():
        if raw.startswith("\x01commit "):
            commit, in_msg, msg_no, path = raw.split()[1][:8], True, 0, ""
            continue
        if raw.startswith("diff --git "):
            in_msg = False
            continue
        if in_msg:
            msg_no += 1
            where, text = f"{commit} message:{msg_no}", raw
        elif raw.startswith("+++ "):
            path = raw[6:] if raw.startswith("+++ b/") else raw[4:]
            continue
        elif raw.startswith("@@"):
            m = re.search(r"\+(\d+)", raw)
            line = int(m.group(1)) if m else 0
            continue
        elif raw.startswith("+"):
            where, text = f"{commit + ' ' if commit else ''}{path}:{line}", raw[1:]
            line += 1
        else:
            continue
        for kind, v in scan_line(text, real_rx):
            if not any(a.search(v) for a in allow):
                yield where, kind, v


def git(repo, *args):
    return run(["git", "-C", repo, "-c", "core.quotepath=off", *args], timeout=300)


def commits_patch(repo, rev_args):
    return git(repo, "log", "-p", "-U0", "--no-ext-diff", "--no-textconv", "--no-color", "--format=%x01commit %H%n%B", *rev_args)


def author_emails(repo, rev_args):
    out = git(repo, "log", "--format=%ae%n%ce", *rev_args).split()
    return Counter(e for e in out if not EMAIL_OK.search(e))


def push_ranges(repo, stdin):
    for ln in stdin.splitlines():
        parts = ln.split()
        if len(parts) != 4 or parts[1] == ZERO:  # malformed or branch delete
            continue
        local, remote = parts[1], parts[3]
        known = remote != ZERO and git(repo, "cat-file", "-t", remote).strip() == "commit"
        yield [f"{remote}..{local}"] if known else [local, "--not", "--remotes"]


def main(argv):
    mode = argv[1] if len(argv) > 1 else ""
    if mode == "report":
        real_rx = compile_values(machine_values())
        for repo in argv[2:]:
            rev = ["--branches", "--not", "--remotes"]
            n = len(git(repo, "rev-list", *rev).split())
            counts = Counter(k for _, k, _ in scan_patch(commits_patch(repo, rev), real_rx, load_allow(repo)))
            ae = sum(author_emails(repo, rev).values())
            kinds = ", ".join(f"{k}={c}" for k, c in counts.most_common()) or "clean"
            print(f"{repo}: {n} unpushed commits | {kinds}" + (f" | author/committer real e-mail on {ae}" if ae else ""))
        return 0

    repo = git(".", "rev-parse", "--show-toplevel").strip() or "."
    allow = load_allow(repo)
    real_rx = compile_values(machine_values(network=mode != "pre-commit"))
    if mode == "pre-commit":
        hits = list(scan_patch(git(repo, "diff", "--cached", "-U0", "--no-ext-diff", "--no-color"), real_rx, allow))
        for where, kind, v in hits[:30]:
            print(f"git-guard WARNING: {where}  {kind}  {mask(v)}", file=sys.stderr)
        if hits:
            print(f"git-guard: {len(hits)} possible private value(s) staged; push will be blocked. Fix or add a regex to {ALLOW_FILE}.", file=sys.stderr)
        return 0
    if mode == "pre-push":
        hits, warned = [], Counter()
        for rev in push_ranges(repo, sys.stdin.read()):
            hits += scan_patch(commits_patch(repo, rev), real_rx, allow)
            warned.update(author_emails(repo, rev))
        for where, kind, v in hits[:50]:
            print(f"git-guard: {where}  {kind}  {mask(v)}", file=sys.stderr)
        for e, c in warned.items():
            print(f"git-guard warning: {c} commit(s) carry a real author/committer e-mail {mask(e)} (not blocked)", file=sys.stderr)
        if hits:
            print(f"git-guard: push BLOCKED, {len(hits)} hit(s). Remove the values (rewrite the commits) or add a regex to {ALLOW_FILE}."
                  " Emergency: git push --no-verify", file=sys.stderr)
            return 1
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
