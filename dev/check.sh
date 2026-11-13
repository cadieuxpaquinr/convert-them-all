#!/bin/sh
#
# Run every node check in dev/checks.
#
# These cover the modules that are pure: a report in, a decision out, with no
# DOM and no network. They used to live in /tmp and were rewritten from memory
# each time a module changed, which is no way to keep a rule.
#
#   ./dev/check.sh
#
# Anything that needs a DOM lives in the harness instead; see dev/sync-harness.py.

set -eu

here=$(cd "$(dirname "$0")" && pwd)
failed=0

for check in "$here"/checks/*.js; do
  name=$(basename "$check" .js)
  if out=$(node "$check" 2>&1); then
    printf '%-12s %s pass\n' "$name" "$(printf '%s' "$out" | grep -c '^ok')"
  else
    printf '%-12s FAILED\n' "$name"
    printf '%s\n' "$out" | grep '^FAIL' || printf '%s\n' "$out"
    failed=1
  fi
done

exit $failed
