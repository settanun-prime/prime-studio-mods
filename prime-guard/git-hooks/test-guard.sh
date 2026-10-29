#!/bin/sh
# self-test: throwaway repo + local bare remote (nothing leaves the PC), hooks enabled only for this repo.
# Prints no real value.
set -u
G=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
git init -q --bare "$T/remote.git"; git init -q -b main "$T/w"; cd "$T/w"
git config core.hooksPath "$G"; git config user.email t@example.com; git config user.name t
git remote add origin "$T/remote.git"
pass=0; fail=0
check() { if [ "$1" = "$2" ]; then echo "PASS $3"; pass=$((pass+1)); else echo "FAIL $3 (exit $1, want $2)"; fail=$((fail+1)); fi; }
real=$(python -c "import sys; sys.path.insert(0,sys.argv[1]); import guard; v=guard.machine_values(); print([x for k,x in v if k=='lan-ip'][0], [x for k,x in v if k=='adapter-mac'][0])" "$G")
set -- $real
up() { git push -q origin "$1" 2>err.txt; }

echo "readme" > a.txt; git add a.txt; git commit -qm init; up main; check $? 0 "clean first push"

k="PRIVATE KEY"; printf -- "-----BEGIN OPENSSH %s-----\nabc\nhost=%s\nmac=%s\n" "$k" "$1" "$2" > leak.txt
git add leak.txt; git commit -qm leak 2>/dev/null; up main; check $? 1 "leak commit blocked"
for kind in private-key lan-ip adapter-mac; do grep -q " $kind " err.txt; check $? 0 "reports $kind"; done
grep -qF "$1" err.txt; check $? 1 "real IP not printed"
git reset -q --hard HEAD~1

echo "server 100.64.0.7 mac 02-00-00-00-00-01 user@example.com" > clean.txt; git add clean.txt; git commit -qm clean
up main; check $? 0 "clean commit passes"

echo "Copyright 2026 $USERNAME" > LICENSE; git add LICENSE; git commit -qm license 2>/dev/null
up main; check $? 1 "user name blocked without allowlist"
printf '^%s$\n' "$USERNAME" > .guard-allow; up main; check $? 0 "allowlisted value passes"

git checkout -q -b feature; p="sk-""ant-"; echo "token $p$(printf 'x%.0s' $(seq 40))" > t.txt; git add t.txt; git commit -qm tok 2>/dev/null
up feature; check $? 1 "new branch scans unpushed commits"

echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
