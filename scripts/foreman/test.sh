#!/usr/bin/env bash
# Tests for the foreman's merge gate, spec check, feedback intake, shots and
# token handling, against a throwaway git repo and a stubbed `gh`. The gate is the only thing between an
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
expect "and the wait restarts from the push"    "no no" "$([ -e "$VERIFY/7" ] && echo yes || echo no) $([ -e "$VERIFY/7.reminded" ] && echo yes || echo no)"

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

: > "$CALLS"; SPEC_LABELS="kind:fix,needs-spec"
spec_ready "$BOARD" 11 >/dev/null
expect "already told: no second comment"        "1 no" "$? $(called 'issue comment')"
expect "but still back to Specced"              "yes"  "$(called '--single-select-option-id o-specced')"

: > "$CALLS"; SPEC_LABELS="kind:fix"; DRY=1
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

# ---- feedback ----------------------------------------------------------------

echo "feedback intake"

autofix() { # id event actor -> one `auto-fix` label event, as the issue events API returns it
  jq -cn --argjson id "$1" --arg e "$2" --arg a "$3" '{id:$id, event:$e, actor:{login:$a}, label:{name:"auto-fix"}, created_at:"2026-11-01T09:00:00Z"}'
}
expect "auto-fix added by the owner counts"        "2026-11-01T09:00:00Z"  "$(owner_added auto-fix <<<"[$(autofix 1 labeled superhighfives)]")"
expect "auto-fix added by anyone else doesn't"     ""  "$(owner_added auto-fix <<<"[$(autofix 1 labeled stranger)]")"
expect "nor by the machine account"                ""  "$(owner_added auto-fix <<<"[$(autofix 1 labeled nylon-foreman)]")"
expect "the owner's, then removed, doesn't"        ""  "$(owner_added auto-fix <<<"[$(autofix 1 labeled superhighfives), $(autofix 2 unlabeled superhighfives)]")"
expect "the owner's after someone else's does"     "2026-11-01T09:00:00Z"  "$(owner_added auto-fix <<<"[$(autofix 1 labeled stranger)]
[$(autofix 2 unlabeled stranger), $(autofix 3 labeled superhighfives)]")"
expect "another label's events don't count"        ""  "$(owner_added auto-fix <<<"[$(labeled 1 labeled superhighfives 2026-11-01T09:00:00Z)]")"

FB_BOARD='{"id":"P","field":{"id":"F","options":[{"id":"o-ideas","name":"Ideas"},{"id":"o-specced","name":"Specced"},{"id":"o-progress","name":"In progress"},{"id":"o-review","name":"In review"}]},"items":{"nodes":[
  {"id":"I21","status":{"name":"Specced"},"content":{"__typename":"Issue","number":21,"state":"OPEN","author":{"login":"superhighfives"},"labels":{"nodes":[{"name":"feedback"},{"name":"auto-fix"}]}}},
  {"id":"I22","status":{"name":"Ideas"},"content":{"__typename":"Issue","number":22,"state":"OPEN","author":{"login":"superhighfives"},"labels":{"nodes":[{"name":"feedback"},{"name":"auto-fix"}]}}},
  {"id":"I23","status":null,"content":{"__typename":"Issue","number":23,"state":"OPEN","author":{"login":"superhighfives"},"labels":{"nodes":[{"name":"feedback"},{"name":"auto-fix"}]}}}
]}}'
fb_issue() { # number author labels... -> one `gh issue list` entry
  local n="$1" a="$2"; shift 2
  jq -cn --argjson n "$n" --arg a "$a" --args '{number:$n, author:{login:$a}, labels:($ARGS.positional | map({name:.}))}' "$@"
}
FB_ISSUES="[$(fb_issue 30 superhighfives feedback auto-fix platform:ios),
  $(fb_issue 21 superhighfives feedback auto-fix),
  $(fb_issue 22 superhighfives feedback auto-fix),
  $(fb_issue 23 superhighfives feedback auto-fix),
  $(fb_issue 24 stranger feedback auto-fix),
  $(fb_issue 25 superhighfives feedback auto-fix needs-decision),
  $(fb_issue 26 superhighfives feedback auto-fix spec),
  $(fb_issue 27 superhighfives feedback)]"
expect "new reports: the owner's, cleared, not yet in hand, oldest first" "22 23 30" \
  "$(feedback_candidates "$FB_BOARD" "$FB_ISSUES" | paste -sd' ' -)"

# feedback_next, with the label events stubbed per issue.
FB_LIST="" FB_PRS="" FB_EVENTS_22="" FB_EVENTS_23=""
gh() {
  echo "$*" >> "$CALLS"
  case "$1 $2" in
    "issue list") echo "$FB_LIST" ;;
    "pr list") [ -n "$FB_PRS" ] && echo 1; return 0 ;;
    "api repos/superhighfives/nylon-impossible/issues/22/events") echo "$FB_EVENTS_22" ;;
    "api repos/superhighfives/nylon-impossible/issues/23/events") echo "$FB_EVENTS_23" ;;
    *) return 1 ;;
  esac
}
rm -rf "$FEEDBACK"
FB_LIST="[$(fb_issue 22 superhighfives feedback auto-fix), $(fb_issue 23 superhighfives feedback auto-fix)]"
FB_EVENTS_22="[$(autofix 1 labeled superhighfives)]" FB_EVENTS_23="[$(autofix 1 labeled superhighfives)]"
expect "the oldest cleared report is next"            "22"  "$(feedback_next "$FB_BOARD")"
FB_EVENTS_22="[$(autofix 1 labeled stranger)]"
expect "auto-fix from anyone else is skipped"         "23"  "$(feedback_next "$FB_BOARD" 2>/dev/null)"
FB_EVENTS_23="[$(autofix 1 labeled stranger)]"
expect "and if nobody else's is the owner's, nothing" ""    "$(feedback_next "$FB_BOARD" 2>/dev/null)"
FB_EVENTS_22="[$(autofix 1 labeled superhighfives)]"
mkdir -p "$FEEDBACK"; echo 1 > "$FEEDBACK/22"
expect "a report already triaged isn't triaged again" ""    "$(feedback_next "$FB_BOARD" 2>/dev/null)"
rm -rf "$FEEDBACK"; FB_PRS=1
expect "nor one with a fix PR open"                   ""    "$(feedback_next "$FB_BOARD" 2>/dev/null)"
FB_PRS=""

BODY_IMAGES='Hi
![one](https://github.com/superhighfives/nylon-impossible/blob/feedback-assets/screenshots/2026/11/a1.png?raw=true)
![two](https://github.com/superhighfives/nylon-impossible/blob/feedback-assets/screenshots/2026/11/b2.jpg?raw=true)
![dupe](https://github.com/superhighfives/nylon-impossible/blob/feedback-assets/screenshots/2026/11/a1.png?raw=true)
![evil](https://github.com/superhighfives/nylon-impossible/blob/feedback-assets/../../etc/passwd)
![other](https://github.com/someone/else/blob/feedback-assets/x.png?raw=true)'
expect "screenshots: this repo's, once each, no ..paths" "screenshots/2026/11/a1.png screenshots/2026/11/b2.jpg" \
  "$(feedback_images <<<"$BODY_IMAGES" | paste -sd' ' -)"

expect "Ready now includes cleared reports"  "22"  "$(jq '.items.nodes |= map(.status = {name:"Ready"})' <<<"$FB_BOARD" | ready_issues "$(cat)" | sed -n 2p)"
SPEC_FB_BOARD=$(jq -c '.items.nodes = [
  {status:{name:"Specced"}, content:{__typename:"Issue", number:41, state:"OPEN", author:{login:"superhighfives"}, labels:{nodes:[{name:"spec"},{name:"feedback"},{name:"needs-decision"}]}}},
  {status:{name:"Specced"}, content:{__typename:"Issue", number:42, state:"OPEN", author:{login:"superhighfives"}, labels:{nodes:[{name:"spec"},{name:"needs-decision"}]}}}]' <<<"$FB_BOARD")
expect "a report's spec still gets runs while it waits on the owner" "41" "$(spec_issues "$SPEC_FB_BOARD" | paste -sd' ' -)"

echo "triage outcomes"

# Everything around the claude run is stubbed; what's tested is what the
# foreman does with the result.
new_worktree() { :; }; run_claude() { return 0; }; opened_pr() { return 1; }
branch_for() { echo "foreman/$1-x"; }
TRIAGE_BODY="" TRIAGE_LABELS="feedback,auto-fix,kind:fix"
gh() {
  echo "$*" >> "$CALLS"
  case "$1 $2" in
    "issue view") jq -cn --arg b "$TRIAGE_BODY" --arg l "$TRIAGE_LABELS" '{body:$b, labels:($l | split(",") | map({name:.}))}' ;;
    api\ repos/*) echo 777 ;;
    *) return 0 ;;
  esac
}
: > "$CALLS"; rm -rf "$FEEDBACK" "$SPECS"; TRIAGE_BODY="${SPEC_OK/None./1. Which colour?}"
triage "$FB_BOARD" 22 >/dev/null
expect "unclear: labelled spec"                       "yes"  "$(called '--add-label spec')"
expect "with needs-decision while it has questions"   "yes"  "$(called '--add-label needs-decision')"
expect "in Specced"                                   "yes"  "$(called '--single-select-option-id o-specced')"
expect "and spec runs wait for the owner's next reply" "777" "$(cat "$SPECS/22")"
expect "and the owner hears"                          "yes"  "$(called 'alert feedback #22 needs a spec')"
expect "it's marked as triaged"                       "yes"  "$([ -e "$FEEDBACK/22" ] && echo yes)"

: > "$CALLS"; TRIAGE_BODY="$SPEC_OK"
triage "$FB_BOARD" 22 >/dev/null
expect "a spec with no questions isn't waiting on the owner" "no"  "$(called '--add-label needs-decision')"

: > "$CALLS"; rm -rf "$FEEDBACK"; TRIAGE_BODY="Just the report."
triage "$FB_BOARD" 22 >/dev/null
expect "neither: needs-decision"                      "yes"  "$(called '--add-label needs-decision')"
expect "and a comment"                                "yes"  "$(called 'issue comment 22')"
expect "back in Ideas"                                "yes"  "$(called '--single-select-option-id o-ideas')"
expect "and re-armed for when the label comes off"    "no"   "$([ -e "$FEEDBACK/22" ] && echo yes || echo no)"

echo "before/after shots"

PR_BODY='Closes #22.

## Try it

- Open the app.

## Notes

Done.'
SECTION_ONE=$'### Before / after\n\n| a | b |\n\n<!-- fix-shots:plan {"shots":[{"device":"iphone","screen":"today"}]} -->'
spliced=$(splice_shots "$SECTION_ONE" <<<"$PR_BODY")
expect "the table goes inside Try it, before the next section" "- Open the app.||<!-- fix-shots:start -->|### Before / after||| a | b |||<!-- fix-shots:plan {\"shots\":[{\"device\":\"iphone\",\"screen\":\"today\"}]} -->|<!-- fix-shots:end -->||## Notes" \
  "$(sed -n '/- Open the app./,/## Notes/p' <<<"$spliced" | paste -sd'|' -)"
respliced=$(splice_shots "### Before / after (again)" <<<"$spliced")
expect "a retake replaces it in place"   "1 0 yes"  "$(grep -c 'fix-shots:start' <<<"$respliced") $(grep -c '| a | b |' <<<"$respliced") $(grep -q '(again)' <<<"$respliced" && echo yes)"
expect "a body without Try it gets one"  "yes"  "$(splice_shots "X" <<<"Closes #1." | tr '\n' ' ' | grep -qE '## Try it +<!-- fix-shots:start' && echo yes)"
expect "the plan can be read back"       '{"shots":[{"device":"iphone","screen":"today"}]}'  "$(saved_plan <<<"$spliced")"
expect "no plan, nothing"                ""  "$(saved_plan <<<"$PR_BODY")"

# feedback-assets: an orphan branch that's only ever added to.
g checkout -q --orphan assets && g rm -rqf . >/dev/null
mkdir -p "$tmp/seed/screenshots/2026/11" "$tmp/seed/fixes/9/aaaaaaaaaaaa"
echo report > "$tmp/seed/screenshots/2026/11/r.png"; echo old > "$tmp/seed/fixes/9/aaaaaaaaaaaa/old.png"
g add -A && g commit -qm assets && g push -q origin HEAD:refs/heads/feedback-assets
ASSETS=$(g rev-parse HEAD)
mkdir -p "$tmp/shots"; echo after > "$tmp/shots/today-after.png"; echo before > "$tmp/shots/today-before.png"
push_shots "$tmp/shots" "fixes/9/bbbbbbbbbbbb" "Before/after for #10 (#9)" >/dev/null
tip=$(git -C "$tmp/origin.git" rev-parse feedback-assets)
expect "the shots land on feedback-assets"      "after before"  "$(git -C "$tmp/origin.git" show "$tip:fixes/9/bbbbbbbbbbbb/today-after.png") $(git -C "$tmp/origin.git" show "$tip:fixes/9/bbbbbbbbbbbb/today-before.png")"
expect "on top of what was there"               "$ASSETS"       "$(git -C "$tmp/origin.git" rev-parse "$tip^")"
expect "which is all still there"               "report old"    "$(git -C "$tmp/origin.git" show "$tip:screenshots/2026/11/r.png") $(git -C "$tmp/origin.git" show "$tip:fixes/9/aaaaaaaaaaaa/old.png")"
# Someone else (the API, filing a report) pushed in between: go on top of theirs.
g fetch -q origin feedback-assets && g checkout -q -B assets "$tip" && echo new > "$tmp/seed/screenshots/2026/11/s.png" && g add -A && g commit -qm report && g push -q origin HEAD:refs/heads/feedback-assets
theirs=$(g rev-parse HEAD)
push_shots "$tmp/shots" "fixes/11/cccccccccccc" "Before/after for #12 (#11)" >/dev/null
tip=$(git -C "$tmp/origin.git" rev-parse feedback-assets)
expect "a branch that moved is built on, not forced" "$theirs new"  "$(git -C "$tmp/origin.git" rev-parse "$tip^") $(git -C "$tmp/origin.git" show "$tip:screenshots/2026/11/s.png")"

# fix_shots end to end, with tsx faked: FAKE_SHOTS=ok takes every shot,
# anything else is a simulator that never comes up.
g checkout -q main && g pull -q origin main 2>/dev/null
mkdir -p "$tmp/seed/src/ios" "$tmp/seed/src/marketing/node_modules/.bin"
echo before > "$tmp/seed/src/ios/app.swift"
cat > "$tmp/seed/src/marketing/node_modules/.bin/tsx" <<'TSX'
#!/bin/sh
cmd=$2 out="" as=""
while [ $# -gt 0 ]; do case "$1" in --out) out=$2; shift ;; --as) as=$2; shift ;; esac; shift; done
case "$cmd" in
  capture) [ "$FAKE_SHOTS" = ok ] && cat ../ios/app.swift > "$out/today-$as.png"; exit 0 ;;
  report) printf '### Before / after\n\nTABLE %s\n\n<!-- fix-shots:plan {} -->\n' "$(ls "$out" | grep -c png)" ;;
esac
TSX
chmod +x "$tmp/seed/src/marketing/node_modules/.bin/tsx"
g add -A && g commit -qm "app" && g push -q origin HEAD:main
g checkout -q -B foreman/9-x && echo after > "$tmp/seed/src/ios/app.swift" && g commit -qam fix && g push -q origin HEAD:refs/heads/foreman/9-x
FIX_SHA=$(g rev-parse HEAD)
mkdir -p "$LOGS" "$WORKTREES" "$SHOTS"
echo '{"shots":[{"device":"iphone","screen":"today"}]}' > "$SHOTS/9.json"
bun() { :; }
gh() {
  case "$1 $2" in
    "pr view") echo "$PR_BODY" ;;
    "pr edit") eval "printf '%s' \"\${$#}\"" > "$tmp/edited" ;;
    *) return 0 ;;
  esac
}
FAKE_SHOTS=fail fix_shots 10 9 foreman/9-x "$SHOTS/9.json" >/dev/null 2>&1
expect "simulator down: the PR still gets the section"  "yes"  "$(grep -q 'TABLE 0' "$tmp/edited" && echo yes)"
expect "inside Try it"                                   "yes"  "$(sed -n '/## Try it/,/## Notes/p' "$tmp/edited" | grep -q 'TABLE 0' && echo yes)"
expect "saying what failed and where the log is"         "yes"  "$(grep -q "2 of 2 shots weren't captured. Log on the Mac mini" "$tmp/edited" && echo yes)"
expect "and nothing is pushed"                           "$tip" "$(git -C "$tmp/origin.git" rev-parse feedback-assets)"
expect "the checkout is cleaned up"                      "no"   "$([ -d "$WORKTREES/shots-10" ] && echo yes || echo no)"

FAKE_SHOTS=ok fix_shots 10 9 foreman/9-x "$SHOTS/9.json" >/dev/null 2>&1
shots_tip=$(git -C "$tmp/origin.git" rev-parse feedback-assets)
expect "shots: both sides captured and in the PR"        "yes"  "$(grep -q 'TABLE 2' "$tmp/edited" && ! grep -q "weren't captured" "$tmp/edited" && echo yes)"
expect "before is main's app, after is the branch's"     "before after"  "$(git -C "$tmp/origin.git" show "$shots_tip:fixes/9/${FIX_SHA:0:12}/today-before.png") $(git -C "$tmp/origin.git" show "$shots_tip:fixes/9/${FIX_SHA:0:12}/today-after.png")"
unset -f bun

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
