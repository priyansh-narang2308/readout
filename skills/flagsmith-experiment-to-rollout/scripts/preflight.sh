#!/bin/sh
# Pre-flight gate (step 4). Usage: preflight.sh <feature> <control> <treatment>
# Prints one line per check; exits non-zero at the first failure. Never prints credentials.
# FLAGSMITH_BIN overrides the CLI (tests use a stub).
FS=${FLAGSMITH_BIN:-flagsmith}
f=$1 c=$2 t=$3
[ -n "$f" ] && [ -n "$c" ] && [ -n "$t" ] || { echo "usage: preflight.sh <feature> <control> <treatment>"; exit 2; }
fail() { echo "✗ $1"; exit 1; }
ok() { echo "✓ $1"; }

$FS auth status --jq '.organisation' >/dev/null 2>&1 || fail "CLI not logged in (run: flagsmith login)"
ok "logged in"

state=$($FS flag get "$f" --jq '"\(.enabled) \(.feature_state_value)"' 2>/dev/null) || fail "flag $f not found in this environment"
set -- $state
[ "$1" = "true" ] || fail "flag $f is disabled"
ok "flag $f enabled"
[ "$2" = "$c" ] || fail "default is '$2', expected control '$c'"
ok "default is control"

vars=$($FS feature get "$f" --jq '[.multivariate_options[].string_value] | join(" ")' 2>/dev/null) || fail "cannot read variants of $f"
case " $vars " in *" $c "*) ;; *) fail "variant '$c' missing" ;; esac
case " $vars " in *" $t "*) ;; *) fail "variant '$t' missing" ;; esac
ok "variants $c and $t exist"
echo "preflight passed — now confirm the manual items in references/preflight-checklist.md"
