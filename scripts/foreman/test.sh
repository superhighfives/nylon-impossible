#!/usr/bin/env bash
# Tests for the foreman's merge gate, spec check and token handling, against a
# throwaway git repo and a stubbed `gh`. The gate is the only thing between an
# agent's PR and main, so every way it could wrongly say "merge" gets a case
# here.
#
#   scripts/foreman/test.sh

set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export FOREMAN_HOME="$tmp/home"
export FOREMAN_MERGEABLE_RETRY_SECONDS=0
export FOREMAN_NOW=1793520000 # 2026-11-01T08:00:00Z
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
    '{state:"OPEN", isDraft:false, labels:[{name:"verified"}], mergeable:"MERGEABLE", headRefOid:$h, headRefName:"foreman/7-x", baseRefOid:$b, statusCheckRollup:$c}'
}
GREEN_CHECKS='[{"status":"COMPLETED","conclusion":"SUCCESS"},{"state":"SUCCESS"},{"status":"COMPLETED","conclusion":"SKIPPED"}]'

# The stub returns what real gh would print *after* its --jq filter.
GH_FAIL="" VIEW="" REVIEW="" THREADS=0 ACTIVITY="" LABEL_EVENTS="" API_FAIL=""
review() { # commit-sha verdict-heading submitted-at [id] -> one raw review, as the API returns it
  jq -cn --arg c "$1" --arg b "## $2" --arg t "$3" --argjson id "${4:-1}" \
    '{id:$id, user:{login:"control-room-review[bot]"}, commit_id:$c, submitted_at:$t, body:($b + "\n\nfindings")}'
}
push() { # sha time -> one push, as the activity API returns it
  jq -cn --arg a "$1" --arg t "$2" '{activity_type:"push", after:$a, timestamp:$t}'
}
labeled() { # id event actor time -> one `verified` label event, as the issue events API returns it
  jq -cn --argjson id "$1" --arg e "$2" --arg a "$3" --arg t "$4" '{id:$id, event:$e, actor:{login:$a}, label:{name:"verified"}, created_at:$t}'
}
api_stub() { # the REST calls the gate makes
  case "$2" in
    */reviews*)  [ "$API_FAIL" = reviews ] && return 1; echo "$REVIEW" ;;
    */events*)   [ "$API_FAIL" = events ] && return 1; echo "$LABEL_EVENTS" ;;
    *activity*)  [ "$API_FAIL" = activity ] && return 1; echo "$ACTIVITY" ;;
    *) return 1 ;;
  esac
}
gh() {
  [ -n "$GH_FAIL" ] && return 1
  case "$1 $2" in
    "pr view")  echo "$VIEW" ;;
    "api graphql") echo "$THREADS" ;;
    api\ repos/*) api_stub "$@" ;;
    *) return 1 ;;
  esac
}
reset() {
  GH_FAIL="" THREADS=0 API_FAIL=""
  VIEW=$(view "$HEAD_SHA" "$GREEN_CHECKS")
  REVIEW="[$(review "$HEAD_SHA" "🟢 Approved" 2026-11-01T09:00:00Z)]"
  # Pushed at 08:00, verified by the owner at 09:30.
  ACTIVITY="[$(push "$HEAD_SHA" 2026-11-01T08:00:00Z), $(push "$OLD_SHA" 2026-10-31T08:00:00Z)]"
  LABEL_EVENTS="[$(labeled 1 labeled superhighfives 2026-11-01T09:30:00Z)]"
}

OLD_SHA=0000000000000000000000000000000000000000
reset
expect "everything green merges, pinned to the head"   "merge $HEAD_SHA"                 "$(gate 7)"

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

echo "verified"

reset; VIEW=$(jq -c '.labels = []' <<<"$VIEW")
expect "no verified waits"                                "wait: not verified"                    "$(gate 7)"

reset; LABEL_EVENTS="[$(labeled 1 labeled "$AGENT" 2026-11-01T09:30:00Z)]"
expect "verified added by the machine account waits"      "wait: verified wasn't added by superhighfives"  "$(gate 7)"

reset; LABEL_EVENTS="[$(labeled 1 labeled someone 2026-11-01T09:30:00Z)]"
expect "verified added by anyone else waits"              "wait: verified wasn't added by superhighfives"  "$(gate 7)"

# The owner verified at 09:30, then a later push moved the head.
reset; ACTIVITY="[$(push "$HEAD_SHA" 2026-11-01T10:00:00Z), $(push "$OLD_SHA" 2026-11-01T08:00:00Z)]"
expect "a push after verified clears it"                  "wait: verified before the latest push"  "$(gate 7)"

# Pushed, pushed away, then pushed back after the owner verified the old one.
reset; ACTIVITY="[$(push "$HEAD_SHA" 2026-11-01T10:00:00Z), $(push "$OLD_SHA" 2026-11-01T09:00:00Z), $(push "$HEAD_SHA" 2026-11-01T08:00:00Z)]"
expect "the head's latest arrival is the one that counts" "wait: verified before the latest push"  "$(gate 7)"

reset; LABEL_EVENTS="[$(labeled 1 labeled superhighfives 2026-11-01T08:00:00Z)]"
expect "verified in the same second as the push waits"    "wait: verified before the latest push"  "$(gate 7)"

# The owner removed it and someone else put it back.
reset; LABEL_EVENTS="[$(labeled 1 labeled superhighfives 2026-11-01T09:30:00Z), $(labeled 2 unlabeled superhighfives 2026-11-01T09:40:00Z), $(labeled 3 labeled someone 2026-11-01T09:50:00Z)]"
expect "only the label's latest event counts"             "wait: verified wasn't added by superhighfives"  "$(gate 7)"

reset; LABEL_EVENTS="[$(labeled 2 labeled superhighfives 2026-11-01T09:50:00Z), $(labeled 1 unlabeled superhighfives 2026-11-01T09:40:00Z)]"
expect "events are ordered by id, not list order"         "merge $HEAD_SHA"                       "$(gate 7)"

reset; ACTIVITY="[$(push "$OLD_SHA" 2026-11-01T08:00:00Z)]"
expect "no record of the head's push waits"               "wait: couldn't tell when the head was pushed"  "$(gate 7)"

reset; API_FAIL=activity
expect "an unreadable activity log waits"                 "wait: couldn't read when the head was pushed"  "$(gate 7)"

reset; API_FAIL=events
expect "unreadable label events wait"                     "wait: couldn't read the label's events"  "$(gate 7)"

MIG_SHA="$(case_sha add-migration)"
reset; VIEW=$(view "$MIG_SHA" "$GREEN_CHECKS"); REVIEW="[$(review "$MIG_SHA" "🟢 Approved" 2026-11-01T09:00:00Z)]"
git -C "$tmp/origin.git" update-ref refs/pull/7/head "$MIG_SHA"
expect_prefix "a green migration is the owner's"       "guarded: touches a migration"    "$(gate 7)"
VIEW=$(jq -c '.labels = []' <<<"$VIEW")
expect_prefix "even before it's verified"              "guarded: touches a migration"    "$(gate 7)"
git -C "$tmp/origin.git" update-ref refs/pull/7/head "$HEAD_SHA"

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
    api\ repos/*) api_stub "$@" ;;
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
    {"author":{"__typename":"User","login":"superhighfives"},"body":"REPLY-OWNER"},
    {"author":{"__typename":"User","login":"nylon-foreman"},"body":"REPLY-AGENT"},
    {"author":{"__typename":"Bot","login":"nylon-foreman"},"body":"INJECT-FAKE-AGENT-BOT"}]}},
  {"id":"T2","isResolved":true,"path":"b.sh","line":1,"comments":{"nodes":[
    {"author":{"__typename":"Bot","login":"control-room-review"},"body":"RESOLVED-FINDING"}]}},
  {"id":"T3","isResolved":false,"path":"c.sh","line":1,"comments":{"nodes":[
    {"author":{"__typename":"User","login":"control-room-review"},"body":"FAKE-BOT-THREAD"}]}}
]}}}}}'
formatted=$(format_threads superhighfives nylon-foreman <<<"$threads_json")
has() { grep -qF "$1" <<<"$formatted" && echo yes || echo no; }
expect "keeps the review bot's finding"            yes "$(has FINDING-ONE)"
expect "keeps the owner's reply"                   yes "$(has REPLY-OWNER)"
expect "keeps claude[bot]'s reply"                 yes "$(has REPLY-CLAUDE)"
expect "keeps the machine account's reply"         yes "$(has REPLY-AGENT)"
expect "drops a bot named like the machine account" no "$(has INJECT-FAKE-AGENT-BOT)"
expect "drops a stranger's reply"                  no  "$(has INJECT-STRANGER)"
expect "drops a person whose login is 'claude'"    no  "$(has INJECT-FAKE-CLAUDE)"
expect "drops resolved threads"                    no  "$(has RESOLVED-FINDING)"
expect "drops threads a person started as the bot" no  "$(has FAKE-BOT-THREAD)"

# ---- waiting for verified ----------------------------------------------------

echo "verified reminders"

: > "$CALLS"; rm -rf "$VERIFY"
verify_reminder 7 1
expect "the first wait only starts the clock"   "no"   "$(called 'alert ')"
expect "and records when"                       "$FOREMAN_NOW"  "$(cat "$VERIFY/7")"
FOREMAN_NOW=$((FOREMAN_NOW + 86399)) verify_reminder 7 1
expect "a day minus a second is quiet"          "no"   "$(called 'alert ')"
FOREMAN_NOW=$((FOREMAN_NOW + 86400)) verify_reminder 7 1
expect "after a day it alerts"                  "yes"  "$(called 'alert #7 has waited a day')"
expect "and comments"                           "yes"  "$(called 'pr comment 7')"
: > "$CALLS"
FOREMAN_NOW=$((FOREMAN_NOW + 200000)) verify_reminder 7 1
expect "once: not again the next day"           "no"   "$(called 'alert ')"
expect "nor another comment"                    "no"   "$(called 'pr comment')"

: > "$CALLS"
clear_verified 7 1
expect "a stale verified is removed"            "yes"  "$(called '--remove-label verified')"
expect "and the owner is told why"              "yes"  "$(called 'pr comment 7')"

# ---- specs -------------------------------------------------------------------

echo "spec check"

SPEC_OK='## Problem

It breaks.

## Acceptance criteria

- [ ] Works. Check: a test.

## How to verify

Open /.

## Open questions

None.

## Decisions

- 2026-11-01: Do it.'
problems() { spec_problems "$1" <<<"$2"; }
expect "a complete spec passes"                     ""  "$(problems kind:fix "$SPEC_OK")"
expect "CRLF and trailing spaces don't matter"      ""  "$(problems kind:fix "${SPEC_OK//$'\n'/  $'\r\n'}")"
expect "a missing section is named"                 "There's no \"## How to verify\" section."  \
  "$(problems kind:fix "${SPEC_OK/How to verify/Verify}")"
expect "open questions block it"                    "\"## Open questions\" doesn't read \"None.\""  \
  "$(problems kind:fix "${SPEC_OK/None./1. Which colour?}")"
expect "\"None.\" plus a question still blocks it"  "\"## Open questions\" doesn't read \"None.\""  \
  "$(problems kind:fix "${SPEC_OK/None./None.$'\n\n'1. But what about dark mode?}")"
expect "an empty Open questions blocks it"          "\"## Open questions\" doesn't read \"None.\""  \
  "$(problems kind:fix "${SPEC_OK/None./}")"
expect "a feature needs its own four sections"      "4"  "$(problems kind:feature "$SPEC_OK" | wc -l | tr -d ' ')"
FEATURE_OK="$SPEC_OK

## Outcome

x

## Behaviour

Unchanged.

## Non-goals

x

## Principles

5."
expect "a complete feature spec passes"             ""  "$(problems kind:feature "$FEATURE_OK")"
expect "an issue with no body has every problem"    "5"  "$(problems "" "" | wc -l | tr -d ' ')"

BOARD='{"id":"P","field":{"id":"F","options":[{"id":"o-ideas","name":"Ideas"},{"id":"o-specced","name":"Specced"},{"id":"o-ready","name":"Ready"}]},"items":{"nodes":[
  {"id":"I1","status":{"name":"Ready"},"content":{"__typename":"Issue","number":11,"state":"OPEN","author":{"login":"superhighfives"},"labels":{"nodes":[]}}},
  {"id":"I2","status":{"name":"Ready"},"content":{"__typename":"Issue","number":12,"state":"OPEN","author":{"login":"stranger"},"labels":{"nodes":[]}}},
  {"id":"I3","status":{"name":"Ready"},"content":{"__typename":"Issue","number":13,"state":"OPEN","author":{"login":"superhighfives"},"labels":{"nodes":[{"name":"needs-decision"}]}}},
  {"id":"I4","status":{"name":"Specced"},"content":{"__typename":"Issue","number":14,"state":"OPEN","author":{"login":"superhighfives"},"labels":{"nodes":[{"name":"spec"}]}}},
  {"id":"I5","status":{"name":"Ideas"},"content":{"__typename":"Issue","number":15,"state":"OPEN","author":{"login":"stranger"},"labels":{"nodes":[{"name":"spec"}]}}},
  {"id":"I6","status":{"name":"Ready"},"content":{"__typename":"Issue","number":16,"state":"OPEN","author":{"login":"superhighfives"},"labels":{"nodes":[{"name":"spec"}]}}},
  {"id":"I7","status":null,"content":{"__typename":"Issue","number":17,"state":"OPEN","author":{"login":"superhighfives"},"labels":{"nodes":[{"name":"spec"}]}}},
  {"id":"I8","status":{"name":"Ready"},"content":{"__typename":"Issue","number":18,"state":"OPEN","author":{"login":"superhighfives"},"labels":{"nodes":[]}}}
]}}'
expect "Ready: the owner's, without needs-decision, in board order"  "11 16 18"  "$(ready_issues "$BOARD" | paste -sd' ' -)"
expect "spec runs: the owner's spec issues not yet Ready"           "14 17"     "$(spec_issues "$BOARD" | paste -sd' ' -)"

SPEC_BODY="" SPEC_LABELS="" COMMENT_IDS=""
gh() {
  echo "$*" >> "$CALLS"
  case "$1 $2" in
    "issue view") jq -cn --arg b "$SPEC_BODY" --arg l "$SPEC_LABELS" '{body:$b, labels:($l | split(",") | map(select(. != "") | {name:.}))}' ;;
    api\ repos/*) tr ' ' '\n' <<<"$COMMENT_IDS" ;;
    *) return 0 ;;
  esac
}
: > "$CALLS"; SPEC_BODY="$SPEC_OK" SPEC_LABELS="kind:fix"
spec_ready "$BOARD" 11 >/dev/null
expect "a complete spec can be built"           "0"    "$?"
expect "and isn't touched"                      "no"   "$(called 'issue edit')"

: > "$CALLS"; SPEC_LABELS="kind:fix,needs-spec"
spec_ready "$BOARD" 11 >/dev/null
expect "a fixed spec loses needs-spec"          "yes"  "$(called '--remove-label needs-spec')"

: > "$CALLS"; SPEC_BODY="${SPEC_OK/None./1. Which?}" SPEC_LABELS="kind:fix"
spec_ready "$BOARD" 11 >/dev/null
expect "open questions refuse the build"        "1"    "$?"
expect "with needs-spec"                        "yes"  "$(called '--add-label needs-spec')"
expect "and a comment saying why"               "yes"  "$(called "doesn't read \"None.\"")"
expect "and back to Specced"                    "yes"  "$(called '--single-select-option-id o-specced')"

: > "$CALLS"; DRY=1
spec_ready "$BOARD" 11 >/dev/null
expect "a dry run refuses without touching it"  "1 no"  "$? $(called 'issue edit')"
DRY=0

echo "spec rounds"
rm -rf "$SPECS"; mkdir -p "$SPECS"; DRY=1
COMMENT_IDS=""
expect "a new spec issue gets a draft"            "would draft the spec for #14"   "$(spec_pass "$BOARD" | sed -E 's/^[0-9-]+ [0-9:]+ //')"
echo 0 > "$SPECS/14"
expect "then nothing until the owner replies"     "would draft the spec for #17"   "$(spec_pass "$BOARD" | sed -E 's/^[0-9-]+ [0-9:]+ //')"
echo 0 > "$SPECS/17"
expect "nothing at all once both are answered"    ""                               "$(spec_pass "$BOARD")"
COMMENT_IDS="501 502"
expect "the owner's reply brings a revision"      "would revise the spec for #14"  "$(spec_pass "$BOARD" | sed -E 's/^[0-9-]+ [0-9:]+ //')"
echo 502 > "$SPECS/14"; echo 502 > "$SPECS/17"
expect "one run per reply"                        ""                               "$(spec_pass "$BOARD")"
DRY=0
# The comments call filters by the owner's login: only their replies start a run.
expect "only the owner's comments are asked for"  "yes"  "$(called 'select(.user.login == "superhighfives") | .id')"

# ---- the machine account's token ---------------------------------------------

echo "token"

TOKEN_RESP="" TOKEN_FAIL=""
user_resp() { # login expiry-header-or-empty -> what `gh api -i user` prints
  printf 'HTTP/2.0 200 OK\r\nContent-Type: application/json\r\n'
  [ -z "$2" ] || printf 'Github-Authentication-Token-Expiration: %s\r\n' "$2"
  printf '\r\n{"login":"%s","id":42}\n' "$1"
}
gh() {
  echo "$*" >> "$CALLS"
  case "$*" in "api -i user") [ -n "$TOKEN_FAIL" ] && return 1; echo "$TOKEN_RESP" ;; *) return 0 ;; esac
}
echo "ghp_test" > "$TOKEN_FILE"
token() { check_token; echo "$? $TOKEN_STATE"; }

TOKEN_RESP=$(user_resp nylon-foreman "2026-12-01 18:50:08 UTC")
expect "the expiry header is read"         "2026-12-01T18:50:08Z"  "$(token_expiry <<<"$TOKEN_RESP")"
expect "a month out is fine"               "0 nylon-foreman, expires 2026-12-01 (30 days)"  "$(token)"
expect "and exports the token"             "ghp_test"  "$(check_token; echo "$GH_TOKEN")"
TOKEN_RESP=$(user_resp nylon-foreman "2026-11-08 09:00:00 UTC")
expect_prefix "7 days out warns"           "1 nylon-foreman, expires 2026-11-08: 7 days left"  "$(token)"
TOKEN_RESP=$(user_resp nylon-foreman "2026-11-09 09:00:00 UTC")
expect_prefix "8 days out doesn't"         "0 "  "$(token)"
TOKEN_RESP=$(user_resp nylon-foreman "")
expect "a token with no expiry is fine"    "0 nylon-foreman, no expiry"  "$(token)"
TOKEN_RESP=$(user_resp superhighfives "2026-12-01 18:50:08 UTC")
expect "the owner's token is refused"      "2 the token in $TOKEN_FILE is for 'superhighfives', not nylon-foreman"  "$(token)"

# GitHub answers an expired token with a bare 401: the expiry it last
# reported says which it is.
TOKEN_FAIL=1; echo "2026-10-31T18:50:08Z" > "$HOME_DIR/token-expiry"
expect_prefix "past its expiry, it's expired"   "2 the nylon-foreman token in $TOKEN_FILE expired on 2026-10-31"  "$(token)"
echo "2026-12-01T18:50:08Z" > "$HOME_DIR/token-expiry"
expect_prefix "otherwise GitHub's just not answering"  "2 GitHub didn't accept"  "$(token)"
TOKEN_FAIL=""
rm -f "$TOKEN_FILE"
expect_prefix "no token file at all"       "2 no token for nylon-foreman"  "$(token)"

: > "$CALLS"; rm -rf "$ONCE"; echo "ghp_test" > "$TOKEN_FILE"
TOKEN_RESP=$(user_resp nylon-foreman "2026-11-05 09:00:00 UTC")
use_token; use_token
expect "a warning alerts once per token"   "1"  "$(grep -c 'alert token: nylon-foreman, expires 2026-11-05' "$CALLS")"
TOKEN_FAIL=1; echo "2026-10-31T18:50:08Z" > "$HOME_DIR/token-expiry"
out=$( (use_token) 2>&1 ); status=$?
expect "an expired token stops the foreman"  "1"  "$status"
expect_prefix "with a clear message"       "foreman: the nylon-foreman token in $TOKEN_FILE expired on 2026-10-31; make a new one"  "$out"
expect "and an alert"                      "yes"  "$(called 'alert stopped: the nylon-foreman token')"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
