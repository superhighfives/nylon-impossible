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
export FOREMAN_MERGEABLE_RETRY_SECONDS=0
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
review() { # commit-sha verdict-heading submitted-at [id] -> one raw review, as the API returns it
  jq -cn --arg c "$1" --arg b "## $2" --arg t "$3" --argjson id "${4:-1}" \
    '{id:$id, user:{login:"control-room-review[bot]"}, commit_id:$c, submitted_at:$t, body:($b + "\n\nfindings")}'
}
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
  REVIEW="[$(review "$HEAD_SHA" "🟢 Approved" 2026-11-01T09:00:00Z)]"
}

reset
expect "everything green merges, pinned to the head"   "merge $HEAD_SHA"                 "$(gate 7)"

OLD_SHA=0000000000000000000000000000000000000000
reset; REVIEW="[$(review "$OLD_SHA" "🟢 Approved" 2026-11-01T09:00:00Z)]"
expect_prefix "only a review of an older commit waits" "wait: no control-room-review[bot] review of the head" "$(gate 7)"

reset; REVIEW="[$(review "$HEAD_SHA" "🟡 Approved with comments" 2026-11-01T09:00:00Z)]"
expect "a 🟡 or 🔴 review waits"                        "wait: review isn't all-green"    "$(gate 7)"

reset; REVIEW="[]"
expect_prefix "no review waits"                        "wait: no "                       "$(gate 7)"

# #563: the head's review came first, then a re-run reviewed an older commit,
# and that one was last in the list. The head's review is the one that counts.
reset; REVIEW="[$(review "$HEAD_SHA" "🟢 Approved" 2026-11-01T09:00:00Z 1), $(review "$OLD_SHA" "🟡 Approved with comments" 2026-11-01T09:44:00Z 2)]"
expect "a later review of an older commit doesn't hide the head's"  "merge $HEAD_SHA"  "$(gate 7)"

# Two reviews of the head: the newer one counts, whatever the list order.
reset; REVIEW="[$(review "$HEAD_SHA" "🟢 Approved" 2026-11-01T10:00:00Z 2), $(review "$HEAD_SHA" "🟡 Approved with comments" 2026-11-01T09:00:00Z 1)]"
expect "the newest review of the head counts"   "merge $HEAD_SHA"  "$(gate 7)"
reset; REVIEW="[$(review "$HEAD_SHA" "🟡 Approved with comments" 2026-11-01T10:00:00Z 2), $(review "$HEAD_SHA" "🟢 Approved" 2026-11-01T09:00:00Z 1)]"
expect "a newer 🟡 on the head overrides an older 🟢"  "wait: review isn't all-green"  "$(gate 7)"

# --paginate prints one JSON array per page.
expect "reviews across pages are all considered"  "2"  "$(printf '%s\n%s\n' "[$(review "$HEAD_SHA" "🟡 x" 2026-11-01T09:00:00Z 1)]" "[$(review "$HEAD_SHA" "🟢 y" 2026-11-01T10:00:00Z 2)]" | pick_review "$HEAD_SHA" | jq .id)"

# Only the review bot's reviews count.
reset; REVIEW=$(jq -c '.[0].user.login = "someone"' <<<"[$(review "$HEAD_SHA" "🟢 Approved" 2026-11-01T09:00:00Z)]")
expect_prefix "a person's 🟢 doesn't count"  "wait: no "  "$(gate 7)"

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
reset; VIEW=$(view "$MIG_SHA" "$GREEN_CHECKS"); REVIEW="[$(review "$MIG_SHA" "🟢 Approved" 2026-11-01T09:00:00Z)]"
git -C "$tmp/origin.git" update-ref refs/pull/7/head "$MIG_SHA"
expect_prefix "a green migration is the owner's"       "guarded: touches a migration"    "$(gate 7)"

# UNKNOWN for two reads, then MERGEABLE: the gate asks again rather than waiting a tick.
# gh runs inside $(…), so the countdown lives in a file.
reset; echo 2 > "$tmp/unknown"
gh() {
  [ -n "$GH_FAIL" ] && return 1
  case "$1 $2" in
    "pr view")
      local left; left=$(cat "$tmp/unknown")
      if [ "$left" -gt 0 ]; then echo $((left - 1)) > "$tmp/unknown"; jq -c '.mergeable = "UNKNOWN"' <<<"$VIEW"
      else echo "$VIEW"; fi ;;
    "api graphql") echo "$THREADS" ;;
    api\ repos/*) echo "$REVIEW" ;;
    *) return 1 ;;
  esac
}
expect "a briefly UNKNOWN mergeability is asked again"  "merge $HEAD_SHA"  "$(gate 7)"
reset; echo 99 > "$tmp/unknown"
expect "but one that stays UNKNOWN waits"               "wait: not mergeable (UNKNOWN)"  "$(gate 7)"
echo 0 > "$tmp/unknown"

reset; mv "$tmp/origin.git" "$tmp/gone.git"
expect "a failed fetch waits"                          "wait: fetch failed"              "$(gate 7)"
mv "$tmp/gone.git" "$tmp/origin.git"

# ---- review rounds, with gh stubbed and claude never reached -----------------

echo "review rounds"

mkdir -p "$ROUNDS"
CALLS="$tmp/calls"
LABELS=""   # labels on the PR, comma-separated; the stub edits them like gh would
REVIEW_ID=101
ROUND_HEAD=1111111111111111111111111111111111111111
gh() {
  echo "$*" >> "$CALLS"
  case "$1 $2" in
    "pr view")
      case "$*" in *headRefOid*) echo "$ROUND_HEAD"; return 0 ;; esac
      # has_label: real gh would print the index or null
      local want; want=$(sed -E 's/.*index\("([^"]+)"\).*/\1/' <<<"$*")
      case ",$LABELS," in *",$want,"*) echo 0 ;; *) echo null ;; esac ;;
    "pr edit")
      local all="$*"
      case "$all" in
        *--add-label*)    LABELS="$LABELS,${all##*--add-label }" ;;
        *--remove-label*) LABELS=$(tr ',' '\n' <<<"$LABELS" | grep -vxF "${all##*--remove-label }" | paste -sd, -) ;;
      esac ;;
    api\ repos/*) echo "[$(review "$ROUND_HEAD" "🟡 Approved with comments" 2026-11-01T09:00:00Z "$REVIEW_ID")]" ;;
    *) return 0 ;;
  esac
}
alert() { echo "alert $*" >> "$CALLS"; }
event() { :; }
called() { grep -qF -- "$1" "$CALLS" && echo yes || echo no; }

: > "$CALLS"; echo 101 > "$ROUNDS/9"; LABELS="fix-round:1"
review_round 9 foreman/1-x 1
expect "a review that already had a round is skipped"  "no"  "$(called 'pr edit')"

: > "$CALLS"; rm -f "$ROUNDS/9"; LABELS="fix-round:1,fix-round:2,fix-round:3"
review_round 9 foreman/1-x 1
expect "after 3 rounds it hands over"   "yes"           "$(called '--add-label needs-decision')"
expect "and marks the review as handed" "handed:101"    "$(cat "$ROUNDS/9")"
expect "and alerts"                     "yes"           "$(called 'alert ')"

# The owner removes needs-decision: re-arm, clear the rounds, start round 1.
# foreman/1-x isn't on the fixture origin, so the fetch fails right after.
: > "$CALLS"; LABELS="fix-round:1,fix-round:2,fix-round:3"
review_round 9 foreman/1-x 1 >/dev/null
expect "removing needs-decision re-arms"        "yes"  "$(called '--remove-label fix-round:3')"
expect "and clears the handed state"            "no"   "$([ -e "$ROUNDS/9" ] && echo yes || echo no)"
expect "a failed fetch doesn't use up a round"  "no"   "$(called '--add-label fix-round:1')"

: > "$CALLS"; rm -f "$ROUNDS/9"; LABELS="fix-round:1"; DRY=1
expect "the round number counts the labels"  "would run review round 2 on #9"  "$(review_round 9 foreman/1-x 1 | sed -E 's/^[0-9-]+ [0-9:]+ //')"
DRY=0

expect "the prompt carries the review"  "yes"  "$(round_prompt 9 foreman/1-x 1 2 'FINDING-XYZ' '' | grep -q FINDING-XYZ && echo yes)"

echo "thread filter"
threads_json='{"data":{"repository":{"pullRequest":{"reviewThreads":{"nodes":[
  {"id":"T1","isResolved":false,"path":"a.sh","line":3,"comments":{"nodes":[
    {"author":{"__typename":"Bot","login":"control-room-review"},"body":"FINDING-ONE"},
    {"author":{"__typename":"User","login":"stranger"},"body":"INJECT-STRANGER"},
    {"author":{"__typename":"User","login":"claude"},"body":"INJECT-FAKE-CLAUDE"},
    {"author":{"__typename":"Bot","login":"claude"},"body":"REPLY-CLAUDE"},
    {"author":{"__typename":"User","login":"superhighfives"},"body":"REPLY-OWNER"}]}},
  {"id":"T2","isResolved":true,"path":"b.sh","line":1,"comments":{"nodes":[
    {"author":{"__typename":"Bot","login":"control-room-review"},"body":"RESOLVED-FINDING"}]}},
  {"id":"T3","isResolved":false,"path":"c.sh","line":1,"comments":{"nodes":[
    {"author":{"__typename":"User","login":"control-room-review"},"body":"FAKE-BOT-THREAD"}]}}
]}}}}}'
formatted=$(format_threads superhighfives <<<"$threads_json")
has() { grep -qF "$1" <<<"$formatted" && echo yes || echo no; }
expect "keeps the review bot's finding"            yes "$(has FINDING-ONE)"
expect "keeps the owner's reply"                   yes "$(has REPLY-OWNER)"
expect "keeps claude[bot]'s reply"                 yes "$(has REPLY-CLAUDE)"
expect "drops a stranger's reply"                  no  "$(has INJECT-STRANGER)"
expect "drops a person whose login is 'claude'"    no  "$(has INJECT-FAKE-CLAUDE)"
expect "drops resolved threads"                    no  "$(has RESOLVED-FINDING)"
expect "drops threads a person started as the bot" no  "$(has FAKE-BOT-THREAD)"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
