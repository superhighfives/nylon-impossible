#!/usr/bin/env bash
# Tests for the foreman's merge gate, against a throwaway git repo and a
# stubbed `gh`. The gate is the only thing between an agent's PR and main,
# so every way it could wrongly say "merge" gets a case here.
#
#   scripts/foreman/test.sh

set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export FOREMAN_HOME="$tmp/home"
# shellcheck source=SCRIPTDIR/foreman.sh
source "$here/foreman.sh"
set +e

pass=0 fail=0
expect() { # name expected actual
  if [ "$2" = "$3" ]; then pass=$((pass + 1)); printf '  ok    %s\n' "$1"
  else fail=$((fail + 1)); printf '  FAIL  %s\n        expected: %s\n        actual:   %s\n' "$1" "$2" "$3"; fi
}
expect_prefix() { # name prefix actual
  case "$3" in "$2"*) expect "$1" "$3" "$3" ;; *) expect "$1" "$2…" "$3" ;; esac
}

# ---- a fixture repo: origin (bare) and the foreman's clone -------------------

git init -q --bare "$tmp/origin.git"
git init -q -b main "$tmp/seed"
g() { git -C "$tmp/seed" -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$tmp/seed/src/api/migrations" "$tmp/seed/src/web" "$tmp/seed/.github/workflows" "$tmp/seed/app.xcodeproj"
echo "select 1;" > "$tmp/seed/src/api/migrations/0001_init.sql"
echo "app" > "$tmp/seed/src/web/app.ts"
echo "on: push" > "$tmp/seed/.github/workflows/ci.yml"
printf 'MARKETING_VERSION = 1.0;\nOTHER = 1;\n' > "$tmp/seed/app.xcodeproj/project.pbxproj"
printf '# Principles\n\n## Principles\n\n1. One.\n\n## Settled\n\n| a | b |\n\n## Vocabulary\n\ntodo\n' > "$tmp/seed/PRINCIPLES.md"
g add -A && g commit -qm base
BASE=$(g rev-parse HEAD)
g remote add origin "$tmp/origin.git" && g push -q origin main

change() { # name, then a command run in the seed repo -> sha of a commit on top of base
  g checkout -q -B "case-$1" "$BASE"
  (cd "$tmp/seed" && eval "$2")
  g add -A && g commit -qm "$1"
  g push -q -f origin "HEAD:refs/heads/case-$1"
  g rev-parse HEAD
}

git clone -q "$tmp/origin.git" "$tmp/home/repo"
CLONE="$tmp/home/repo"
fetch_all() { git -C "$CLONE" fetch -q origin '+refs/heads/*:refs/remotes/origin/*'; }

echo "guarded_reason"

# bash 3.2 (macOS's /bin/bash, which launchd uses): no associative arrays.
# Each case's commit sha goes in a file named after it.
case_sha() { cat "$tmp/sha-$1"; }
mk() { change "$1" "$2" > "$tmp/sha-$1"; }
mk plain             'echo more >> src/web/app.ts'
mk add-migration     'echo "select 2;" > src/api/migrations/0002.sql'
mk rename-migration  'git mv src/api/migrations/0001_init.sql src/web/notes.sql'
mk delete-migration  'git rm -q src/api/migrations/0001_init.sql'
mk workflow          'echo "on: pull_request" > .github/workflows/ci.yml'
mk claude-dir        'mkdir -p .claude/skills && echo x > .claude/skills/x.md'
mk claude-md         'echo "# rules" > CLAUDE.md'
mk nested-agents     'echo "# web" > src/web/AGENTS.md'
mk wrangler          'echo "{}" > src/web/wrangler.jsonc'
mk fastlane          'mkdir -p ios/fastlane && echo x > ios/fastlane/Fastfile'
mk foreman           'mkdir -p scripts/foreman && echo x > scripts/foreman/foreman.sh'
mk version           'sed -i.bak "s/1.0/1.1/" app.xcodeproj/project.pbxproj && rm app.xcodeproj/project.pbxproj.bak'
mk pbxproj-other     'sed -i.bak "s/OTHER = 1/OTHER = 2/" app.xcodeproj/project.pbxproj && rm app.xcodeproj/project.pbxproj.bak'
mk settled           'sed -i.bak "s/| a | b |/| a | c |/" PRINCIPLES.md && rm PRINCIPLES.md.bak'
mk principles-other  'sed -i.bak "s/1. One./1. Uno./" PRINCIPLES.md && rm PRINCIPLES.md.bak'
fetch_all

reason() { guarded_reason "$BASE" "$(case_sha "$1")"; }
expect "plain change isn't guarded"               ""                                                        "$(reason plain)"
expect_prefix "adding a migration"                "touches a migration"                                     "$(reason add-migration)"
expect_prefix "renaming a migration away"         "touches a migration"                                     "$(reason rename-migration)"
expect_prefix "deleting a migration"              "touches a migration"                                     "$(reason delete-migration)"
expect_prefix "a workflow"                        "touches CI or repo automation"                           "$(reason workflow)"
expect_prefix ".claude/"                          "changes agent instructions"                              "$(reason claude-dir)"
expect_prefix "CLAUDE.md"                         "changes agent instructions"                              "$(reason claude-md)"
expect_prefix "a nested AGENTS.md"                "changes agent instructions"                              "$(reason nested-agents)"
expect_prefix "a nested wrangler.jsonc"           "touches Worker bindings"                                 "$(reason wrangler)"
expect_prefix "Fastlane"                          "touches Fastlane config"                                 "$(reason fastlane)"
expect_prefix "the foreman"                       "changes the foreman itself"                              "$(reason foreman)"
expect "a version bump"                           "bumps the app version or build number"                   "$(reason version)"
expect "other pbxproj changes aren't guarded"     ""                                                        "$(reason pbxproj-other)"
expect "the Settled table"                        "changes PRINCIPLES.md's Settled table"                   "$(reason settled)"
expect "the rest of PRINCIPLES.md isn't guarded"  ""                                                        "$(reason principles-other)"
guarded_reason "$BASE" 0000000000000000000000000000000000000000 >/dev/null
expect "an unknown commit fails, not passes"      1                                                         "$?"

# ---- gate, with gh stubbed ---------------------------------------------------

echo "gate"

HEAD_SHA="$(case_sha plain)"
git -C "$tmp/origin.git" update-ref refs/pull/7/head "$HEAD_SHA"

view() { # head checks-json
  jq -cn --arg h "$1" --arg b "$BASE" --argjson c "$2" \
    '{state:"OPEN", isDraft:false, labels:[], mergeable:"MERGEABLE", headRefOid:$h, baseRefOid:$b, statusCheckRollup:$c}'
}
GREEN_CHECKS='[{"status":"COMPLETED","conclusion":"SUCCESS"},{"state":"SUCCESS"},{"status":"COMPLETED","conclusion":"SKIPPED"}]'

# The stub returns what real gh would print *after* its --jq filter.
GH_FAIL="" VIEW="" REVIEW="" THREADS=0
gh() {
  [ -n "$GH_FAIL" ] && return 1
  case "$1 $2" in
    "pr view")  echo "$VIEW" ;;
    "api graphql") echo "$THREADS" ;;
    api\ repos/*) echo "$REVIEW" ;;
    *) return 1 ;;
  esac
}
reset() {
  GH_FAIL="" THREADS=0
  VIEW=$(view "$HEAD_SHA" "$GREEN_CHECKS")
  REVIEW=$(jq -cn --arg h "$HEAD_SHA" '{commit_id:$h, green:true}')
}

reset
expect "everything green merges, pinned to the head"   "merge $HEAD_SHA"                 "$(gate 7)"

reset; REVIEW=$(jq -cn '{commit_id:"0000000000000000000000000000000000000000", green:true}')
expect "a review of an older commit waits"             "wait: review is for an older commit" "$(gate 7)"

reset; REVIEW=$(jq -cn --arg h "$HEAD_SHA" '{commit_id:$h, green:false}')
expect "a 🟡 or 🔴 review waits"                        "wait: review isn't all-green"    "$(gate 7)"

reset; REVIEW=""
expect_prefix "no review waits"                        "wait: no "                       "$(gate 7)"

reset; VIEW=$(view "$HEAD_SHA" '[{"status":"IN_PROGRESS","conclusion":null}]')
expect "pending checks wait"                           "wait: checks pending"            "$(gate 7)"

reset; VIEW=$(view "$HEAD_SHA" '[{"status":"COMPLETED","conclusion":"FAILURE"}]')
expect "a failed check waits"                          "wait: checks red"                "$(gate 7)"

reset; VIEW=$(view "$HEAD_SHA" '[]')
expect "no checks at all waits"                        "wait: checks none"               "$(gate 7)"

reset; THREADS=2
expect_prefix "the owner's open threads wait"          "wait: 2 unresolved"              "$(gate 7)"

reset; GH_FAIL=1
expect "gh failing waits"                              "wait: couldn't read the PR"      "$(gate 7)"

reset; VIEW=$(jq -c '.labels = [{name:"needs-decision"}]' <<<"$VIEW")
expect "needs-decision waits"                          "wait: needs-decision"            "$(gate 7)"

MIG_SHA="$(case_sha add-migration)"
reset; VIEW=$(view "$MIG_SHA" "$GREEN_CHECKS"); REVIEW=$(jq -cn --arg h "$MIG_SHA" '{commit_id:$h, green:true}')
git -C "$tmp/origin.git" update-ref refs/pull/7/head "$MIG_SHA"
expect_prefix "a green migration is the owner's"       "guarded: touches a migration"    "$(gate 7)"

reset; mv "$tmp/origin.git" "$tmp/gone.git"
expect "a failed fetch waits"                          "wait: fetch failed"              "$(gate 7)"
mv "$tmp/gone.git" "$tmp/origin.git"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
