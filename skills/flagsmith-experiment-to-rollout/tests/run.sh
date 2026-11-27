#!/bin/sh
# Tests for srm.mjs and preflight.sh. No network: preflight runs against a stub CLI.
cd "$(dirname "$0")/.." || exit 1
pass=0 failn=0
t() { if [ "$1" = "$2" ]; then pass=$((pass + 1)); else failn=$((failn + 1)); echo "FAIL $3: got $1, want $2"; fi; }

node scripts/srm.mjs --a 140 --b 150 >/dev/null; t $? 0 "srm balanced"
node scripts/srm.mjs --a 100 --b 200 >/dev/null; t $? 1 "srm broken"
node scripts/srm.mjs --a 10 --b 20 >/dev/null; t $? 3 "srm too few"
node scripts/srm.mjs --a x --b 2 >/dev/null; t $? 2 "srm bad input"

stub=$(mktemp)
cat > "$stub" <<'EOF'
#!/bin/sh
case "$1 $2" in
  "auth status") [ -n "$STUB_NOAUTH" ] && exit 1; echo 1 ;;
  "flag get") echo "${STUB_STATE:-true control}" ;;
  "feature get") echo "${STUB_VARS:-control treatment}" ;;
esac
EOF
chmod +x "$stub"
export FLAGSMITH_BIN=$stub
sh scripts/preflight.sh demo control treatment >/dev/null; t $? 0 "preflight pass"
STUB_NOAUTH=1 sh scripts/preflight.sh demo control treatment >/dev/null; t $? 1 "preflight no login"
STUB_STATE="false control" sh scripts/preflight.sh demo control treatment >/dev/null; t $? 1 "preflight disabled"
STUB_STATE="true treatment" sh scripts/preflight.sh demo control treatment >/dev/null; t $? 1 "preflight wrong default"
STUB_VARS="control" sh scripts/preflight.sh demo control treatment >/dev/null; t $? 1 "preflight missing variant"
sh scripts/preflight.sh demo >/dev/null; t $? 2 "preflight usage"
rm -f "$stub"
echo "$pass passed, $failn failed"
[ "$failn" -eq 0 ]
