#!/usr/bin/env bash
# Tests for the foreman's merge gate, spec check, feedback intake, shots,
# token handling and routines, against a throwaway git repo and a stubbed `gh`. The gate is the only thing between an
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
export FOREMAN_NOW=1793520000 # 2026-11-01T08:00:00Z, a Sunday
export TZ=UTC # the routines' schedules are in local time
export FOREMAN_OPERATOR_PLISTS="$tmp/LaunchAgents"
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
# ensure_clone sets these on the real clone; a CI runner has no identity at all.
git -C "$CLONE" config user.name t
git -C "$CLONE" config user.email t@t
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
mk rename-workflow   'git mv .github/workflows/ci.yml src/web/ci.yml'
mk claude-dir        'mkdir -p .claude/skills && echo x > .claude/skills/x.md'
mk claude-settings   'mkdir -p .claude && echo {} > .claude/settings.json'
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
expect "adding a migration isn't guarded"         ""                                                        "$(reason add-migration)"
expect "nor renaming one"                         ""                                                        "$(reason rename-migration)"
expect "nor deleting one"                         ""                                                        "$(reason delete-migration)"
expect_prefix "a workflow"                        "touches CI or repo automation"                           "$(reason workflow)"
expect_prefix "renaming a workflow away"          "touches CI or repo automation"                           "$(reason rename-workflow)"
expect ".claude/ skills aren't guarded"           ""                                                        "$(reason claude-dir)"
expect_prefix "the rest of .claude/ is"           "changes agent instructions"                              "$(reason claude-settings)"
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
    '{state:"OPEN", isDraft:false, labels:[], mergeable:"MERGEABLE", headRefOid:$h, headRefName:"foreman/7-x", baseRefOid:$b, statusCheckRollup:$c}'
}
GREEN_CHECKS='[{"status":"COMPLETED","conclusion":"SUCCESS"},{"state":"SUCCESS"},{"status":"COMPLETED","conclusion":"SKIPPED"}]'

# The stub returns what real gh would print *after* its --jq filter.
GH_FAIL="" VIEW="" REVIEW="" THREADS=0 API_FAIL=""
review() { # commit-sha verdict-heading submitted-at [id] -> one raw review, as the API returns it
  jq -cn --arg c "$1" --arg b "## $2" --arg t "$3" --argjson id "${4:-1}" \
    '{id:$id, user:{login:"control-room-review[bot]"}, commit_id:$c, submitted_at:$t, body:($b + "\n\nfindings")}'
}
api_stub() { # the REST calls the gate makes
  case "$2" in
    */reviews*)  [ "$API_FAIL" = reviews ] && return 1; echo "$REVIEW" ;;
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

# No `verified` (owner, 2026-11-10): checks, the review and the guarded
# areas are the whole gate, for every foreman/* PR alike.
reset; VIEW=$(jq -c '.headRefName = "foreman/deps-2026-11-02"' <<<"$VIEW")
expect "a green, 🟢 dependency bundle merges"          "merge $HEAD_SHA"                 "$(gate 7)"
reset; VIEW=$(jq -c '.labels = [{name:"verified"}]' <<<"$VIEW")
expect "a leftover verified label changes nothing"     "merge $HEAD_SHA"                 "$(gate 7)"

MIG_SHA="$(case_sha add-migration)"
reset; VIEW=$(view "$MIG_SHA" "$GREEN_CHECKS"); REVIEW="[$(review "$MIG_SHA" "🟢 Approved" 2026-11-01T09:00:00Z)]"
git -C "$tmp/origin.git" update-ref refs/pull/7/head "$MIG_SHA"
expect "a green migration merges"                     "merge $MIG_SHA"                  "$(gate 7)"
WF_SHA="$(case_sha workflow)"
reset; VIEW=$(jq -c '.headRefName = "foreman/deps-2026-11-02"' <<<"$(view "$WF_SHA" "$GREEN_CHECKS")")
REVIEW="[$(review "$WF_SHA" "🟢 Approved" 2026-11-01T09:00:00Z)]"
git -C "$tmp/origin.git" update-ref refs/pull/7/head "$WF_SHA"
expect_prefix "a bundle that bumps a workflow is the owner's"  "guarded: touches CI"  "$(gate 7)"
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

# ---- stalls ------------------------------------------------------------------

echo "stalls"

# merge_pass in a subshell, so its stubs don't leak: GATE is the verdict,
# OPEN_PRS what `gh pr list` prints (after its --jq), MERGE_FAIL refuses merges.
T0=$FOREMAN_NOW
SHA_A=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa SHA_B=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
GATE="" MERGE_FAIL="" OPEN_PRS=""
open_pr() { printf '7\tforeman/1-x\t%s\n' "$1"; }
mp() { # [--dry-run] -> merge_pass's log
  (
    [ "${1:-}" = --dry-run ] && DRY=1
    gate() { echo "$GATE"; }
    gh() {
      echo "$*" >> "$CALLS"
      case "$1 $2" in
        "pr list") printf '%s' "$OPEN_PRS" ;;
        "pr merge") [ -z "$MERGE_FAIL" ] ;;
        "pr view") echo null ;;
        *) return 0 ;;
      esac
    }
    event() { echo "event $*" >> "$CALLS"; }
    review_round() { :; }
    set_status() { :; }; rm_worktree() { :; }
    merge_pass '{}'
  ) | sed -E 's/^[0-9-]+ [0-9:]+ //'
}
at() { FOREMAN_NOW=$((T0 + $1)); }
alerts() { grep -c '^alert ' "$CALLS"; }
stalls() { grep -c '^event stalled ' "$CALLS"; }
fresh() { rm -rf "$WAITS"; : > "$CALLS"; FOREMAN_NOW=$T0; OPEN_PRS=$(open_pr "$SHA_A"); MERGE_FAIL=""; }

NO_REVIEW="wait: no control-room-review[bot] review of the head commit yet"
fresh; GATE="$NO_REVIEW"; mp >/dev/null
expect "a tracked wait starts the clock"          "$T0|$SHA_A|${NO_REVIEW#wait: }"  "$(paste -sd'|' - < "$WAITS/7")"
at 7199; mp >/dev/null
expect "2h minus a second is quiet"               "0 0"  "$(alerts) $(stalls)"
at 7200; mp >/dev/null
expect "at 2h: one alert and one stalled event"   "1 1"  "$(alerts) $(stalls)"
expect "the alert says which PR and why"          "yes"  "$(called "alert #7 has waited 2h on \"${NO_REVIEW#wait: }\": https://github.com/superhighfives/nylon-impossible/pull/7")"
expect "the event carries the reason"             "yes"  "$(called "event stalled 1 7 ${NO_REVIEW#wait: }")"
at 20000; mp >/dev/null
expect "only once for that wait"                  "1 1"  "$(alerts) $(stalls)"

at 21000; GATE="wait: checks red"; mp >/dev/null
expect "a changed reason restarts the clock"      "$((T0 + 21000))"  "$(head -1 "$WAITS/7")"
expect "and re-arms the alert"                    "no"   "$([ -e "$WAITS/7.alerted" ] && echo yes || echo no)"
at $((21000 + 7200)); mp >/dev/null
expect "so the new reason alerts after 2h"        "2"    "$(alerts)"

fresh; GATE="wait: checks red"; mp >/dev/null
at 7000; OPEN_PRS=$(open_pr "$SHA_B"); mp >/dev/null
expect "a new head with the same reason restarts the clock"  "$((T0 + 7000))|$SHA_B"  "$(sed -n 1,2p "$WAITS/7" | paste -sd'|' -)"
at 7200; mp >/dev/null
expect "so 2h after the first push is quiet"      "0"    "$(alerts)"

fresh; GATE="wait: 2 unresolved thread(s) from superhighfives"; mp >/dev/null
at 3600; GATE="wait: 1 unresolved thread(s) from superhighfives"; mp >/dev/null
expect "a changed count keeps the clock"          "$T0"  "$(head -1 "$WAITS/7")"
fresh; GATE="wait: not mergeable (UNKNOWN)"; mp >/dev/null
at 3600; GATE="wait: not mergeable (CONFLICTING)"; mp >/dev/null
at 7200; GATE="wait: not mergeable (UNKNOWN)"; mp >/dev/null
expect "a flapping state still alerts at 2h"      "1"    "$(alerts)"
fresh; GATE="wait: checks red"; mp >/dev/null
at 3600; GATE="wait: couldn't read review threads"; mp >/dev/null
at 4200; GATE="wait: checks red"; mp >/dev/null
expect "a failed read keeps the clock"            "$T0|checks red"  "$(sed -n '1p;3p' "$WAITS/7" | paste -sd'|' -)"
fresh; GATE="wait: couldn't read review threads"; mp >/dev/null
at 7200; mp >/dev/null
expect "but one that keeps failing alerts"        "1"    "$(alerts)"
fresh; GATE="wait: checks red"; mp >/dev/null
at 600
expect "a failed PR list says so"                 "couldn't list the open PRs"  "$( (gh() { return 1; }; merge_pass '{}') | sed -E 's/^[0-9-]+ [0-9:]+ //')"
expect "and keeps every clock"                    "yes"  "$([ -e "$WAITS/7" ] && echo yes || echo no)"

fresh; GATE="wait: checks pending"; mp >/dev/null
at 7200; mp >/dev/null
expect "pending checks are quiet at 2h"           "0"    "$(alerts)"
at 43200; mp >/dev/null
expect "and alert at 12h"                         "1"    "$(alerts)"

for v in "wait: needs-decision" "wait: draft"; do
  fresh; GATE="$v"; mp >/dev/null
  expect "${v#wait: } never starts a clock"       "no"   "$([ -e "$WAITS/7" ] && echo yes || echo no)"
done
fresh; GATE="wait: checks red"; mp >/dev/null; GATE="wait: needs-decision"; mp >/dev/null
expect "and needs-decision stops one"             "no"   "$([ -e "$WAITS/7" ] && echo yes || echo no)"
fresh; GATE="wait: checks red"; mp >/dev/null; GATE="guarded: touches CI or repo automation (x)"; mp >/dev/null
expect "a guarded verdict clears the clock"       "no"   "$([ -e "$WAITS/7" ] && echo yes || echo no)"
fresh; GATE="wait: checks red"; mp >/dev/null; GATE="merge $SHA_A"; mp >/dev/null
expect "a merge clears it"                        "no"   "$([ -e "$WAITS/7" ] && echo yes || echo no)"
expect "and alerts with the Try it link"          "yes"  "$(called 'alert merged #7. Once it'"'"'s live, try it: https://github.com/superhighfives/nylon-impossible/pull/7#try-it')"

fresh; GATE="merge $SHA_A"; MERGE_FAIL=1; mp >/dev/null
expect "a refused merge is tracked"               "merge refused"  "$(sed -n 3p "$WAITS/7")"
at 7200; mp >/dev/null
expect "and alerts after 2h"                      "yes"  "$(called 'alert #7 has waited 2h on "merge refused"')"

fresh; GATE="wait: checks red"; mp >/dev/null; at 7200; mp >/dev/null
OPEN_PRS=""; at 7800; mp >/dev/null
expect "a merged or closed PR's files are removed"  ""  "$(ls -A "$WAITS")"

fresh; GATE="wait: checks red"; mp --dry-run >/dev/null
expect "a dry run writes no clock"                "no"   "$([ -e "$WAITS/7" ] && echo yes || echo no)"
mp >/dev/null; at 7200
expect "and alerts nothing, but says it would"    "would alert #7 stalled on \"checks red\""  "$(mp --dry-run | grep 'would alert')"
expect "nor marks it"                             "0 no" "$(alerts) $([ -e "$WAITS/7.alerted" ] && echo yes || echo no)"
FOREMAN_NOW=$T0

# status: a fixture waits/ directory. #8 is past 2h, #9 past 2h but pending
# (quiet until 12h), #10 isn't open, #11 is the oldest.
rm -rf "$WAITS"; mkdir -p "$WAITS"
printf '%s\n%s\n%s\n' $((T0 - 10800)) "$SHA_A" "checks red" > "$WAITS/8"
printf '%s\n%s\n%s\n' $((T0 - 10800)) "$SHA_A" "checks pending" > "$WAITS/9"
printf '%s\n%s\n%s\n' $((T0 - 10800)) "$SHA_A" "checks red" > "$WAITS/10"
printf '%s\n%s\n%s\n' $((T0 - 50000)) "$SHA_A" "merge refused" > "$WAITS/11"
touch "$WAITS/11.alerted"
gh() { echo "$*" >> "$CALLS"; printf '8\n9\n11\n'; }
expect "status lists open stalls, oldest first" \
  "stalled: #11 on \"merge refused\" since 2026-10-31T18:06:40Z|stalled: #8 on \"checks red\" since 2026-11-01T05:00:00Z" \
  "$(stalled_prs | paste -sd'|' -)"
expect "and the digest lists them under Problems" \
  "- #11 has waited on \"merge refused\" since 2026-10-31T18:06:40Z|- #8 has waited on \"checks red\" since 2026-11-01T05:00:00Z" \
  "$(EVENTS=/dev/null digest_problems 0 | paste -sd'|' -)"
rm -rf "$WAITS"

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
# The Sentry sweep files issues as the machine account; nobody else's count.
AUTHOR_BOARD=$(jq -c '.items.nodes += [
  {id:"I19", status:{name:"Ready"}, content:{__typename:"Issue", number:19, state:"OPEN", author:{login:"nylon-foreman"}, labels:{nodes:[]}}},
  {id:"I20", status:{name:"Specced"}, content:{__typename:"Issue", number:20, state:"OPEN", author:{login:"nylon-foreman"}, labels:{nodes:[{name:"spec"}]}}},
  {id:"I21", status:{name:"Ready"}, content:{__typename:"Issue", number:21, state:"OPEN", author:{login:"nylon-foreman-bot"}, labels:{nodes:[]}}},
  {id:"I22", status:{name:"Specced"}, content:{__typename:"Issue", number:22, state:"OPEN", author:{login:"stranger"}, labels:{nodes:[{name:"spec"}]}}}]' <<<"$BOARD")
expect "Ready also takes the machine account's issues, and nobody else's"  "11 16 18 19"  "$(ready_issues "$AUTHOR_BOARD" | paste -sd' ' -)"
expect "so do spec runs"                                                   "14 17 20"     "$(spec_issues "$AUTHOR_BOARD" | paste -sd' ' -)"

# The owner may rename the spec column "Define" on the board at any time.
define() { # board_json -> the same board, its spec column renamed Define
  jq -c '(.field.options[] | select(.name == "Specced")) |= {id:"o-define", name:"Define"}
    | .items.nodes |= map(if .status.name? == "Specced" then .status.name = "Define" else . end)' <<<"$1"
}
on_board() { # board_json command... -> the command, with SPEC_COL read from that board
  ( spec_column "$1"; "${@:2}" )
}
DEFINE_BOARD=$(define "$AUTHOR_BOARD")
expect "the spec column is Specced on a board that has it"   "Specced"  "$(spec_column "$BOARD"; echo "$SPEC_COL")"
expect "and Define once it's renamed"                        "Define"   "$(spec_column "$DEFINE_BOARD"; echo "$SPEC_COL")"
expect "Define wins if the board has both"                   "Define"   "$(spec_column "$(jq -c '.field.options += [{id:"o-define", name:"Define"}]' <<<"$BOARD")"; echo "$SPEC_COL")"
out=$( (spec_column "$(jq -c '.field.options |= map(select(.name != "Specced"))' <<<"$BOARD")"; echo "carried on") 2>&1 )
expect "neither stops the run"                               "1 foreman: no status called 'Define' or 'Specced' on the board" "$? $out"
expect "spec runs on a Define board"                         "14 17 20"  "$(on_board "$DEFINE_BOARD" spec_issues "$DEFINE_BOARD" | paste -sd' ' -)"

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

: > "$CALLS"; SPEC_LABELS="kind:fix"
on_board "$(define "$BOARD")" spec_ready "$(define "$BOARD")" 11 >/dev/null
expect "on a Define board, back to Define"      "yes no"  "$(called '--single-select-option-id o-define') $(called 'o-specced')"

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

echo "spec outcomes"
# Settled specs go to Ready on their own (owner, 2026-11-10).
outcome() { # body labels -> spec_outcome's calls
  ( SPEC_BODY="$1" SPEC_LABELS="$2"; : > "$CALLS"
    set_status() { echo "set_status $2 $3" >> "$CALLS"; }
    spec_outcome "$BOARD" 11 >/dev/null; cat "$CALLS" )
}
calls=$(outcome "$SPEC_OK" "kind:fix,spec")
expect "a settled spec moves to Ready"            "yes"  "$(grep -qxF 'set_status 11 Ready' <<<"$calls" && echo yes || echo no)"
expect "and says so"                              "yes"  "$(grep -qF "alert #11's spec is settled, so it's in Ready" <<<"$calls" && echo yes || echo no)"
calls=$(outcome "${SPEC_OK/None./1. Which?}" "kind:fix,spec")
expect "an open one stays put"                    "no"   "$(grep -qF 'set_status 11 Ready' <<<"$calls" && echo yes || echo no)"
expect "and asks the owner"                       "yes"  "$(grep -qF "alert #11's spec has questions for you" <<<"$calls" && echo yes || echo no)"
calls=$(outcome "${SPEC_OK/None./1. Which?}" "kind:fix,spec,feedback")
expect "an open feedback spec gets needs-decision" "yes" "$(grep -qF -- '--add-label needs-decision' <<<"$calls" && echo yes || echo no)"
calls=$(outcome "$SPEC_OK" "kind:fix,spec,feedback")
expect "a settled one loses it, and goes to Ready" "yes yes" "$(grep -qF -- '--remove-label needs-decision' <<<"$calls" && echo yes || echo no) $(grep -qxF 'set_status 11 Ready' <<<"$calls" && echo yes || echo no)"

echo "settled specs outside a spec run"
SETTLE_BOARD=$(jq -c '.items.nodes += [
  {id:"I23", status:{name:"Specced"}, content:{__typename:"Issue", number:23, state:"OPEN", author:{login:"superhighfives"}, labels:{nodes:[{name:"spec"},{name:"needs-decision"}]}}},
  {id:"I24", status:{name:"Specced"}, content:{__typename:"Issue", number:24, state:"OPEN", author:{login:"superhighfives"}, labels:{nodes:[{name:"spec"},{name:"needs-decision"},{name:"feedback"}]}}},
  {id:"I25", status:{name:"Specced"}, content:{__typename:"Issue", number:25, state:"OPEN", author:{login:"superhighfives"}, labels:{nodes:[]}}}]' <<<"$AUTHOR_BOARD")
expect "candidates: spec column only, needs-decision only on feedback" "14 20 24" "$(settled_specs "$SETTLE_BOARD" | paste -sd' ' -)"
settle() { # body seen-id comment-ids -> settle_pass's calls on a board with only #14
  ( SPEC_BODY="$1" SPEC_LABELS="spec" COMMENT_IDS="$3"; : > "$CALLS"
    rm -rf "$SPECS"; mkdir -p "$SPECS"; [ -z "$2" ] || echo "$2" > "$SPECS/14"
    settled_specs() { echo 14; }
    set_status() { echo "set_status $2 $3" >> "$CALLS"; }
    settle_pass "$BOARD" >/dev/null; cat "$CALLS" )
}
expect "an answered spec that reads None. goes to Ready"   "yes" "$(grep -qxF 'set_status 14 Ready' <<<"$(settle "$SPEC_OK" 502 "501 502")" && echo yes || echo no)"
expect "one with open questions stays"                     "no"  "$(grep -qF 'set_status' <<<"$(settle "${SPEC_OK/None./1. Which?}" 502 "502")" && echo yes || echo no)"
expect "one with an unanswered reply is spec_pass's"       "no"  "$(grep -qF 'set_status' <<<"$(settle "$SPEC_OK" 501 "501 502")" && echo yes || echo no)"
expect "and so is one never drafted"                       "no"  "$(grep -qF 'set_status' <<<"$(settle "$SPEC_OK" "" "")" && echo yes || echo no)"
DRY=1
expect "a dry run only says so"                            "no"  "$(grep -qF 'set_status' <<<"$(settle "$SPEC_OK" 502 "502")" && echo yes || echo no)"
DRY=0

echo "drafts in the spec column"

DRAFT_BOARD=$(jq -c '.items.nodes = [
  {id:"DI_1", status:{name:"Ideas"}, content:{__typename:"DraftIssue", title:"Left in Ideas", body:"Not yet."}},
  {id:"DI_2", status:{name:"Specced"}, content:{__typename:"DraftIssue", title:"Web: sort positions by code point", body:"localeCompare sorts \"a\" after \"B\".\n\nSee src/web/a.ts."}},
  {id:"DI_3", status:{name:"Ready"}, content:{__typename:"DraftIssue", title:"Dragged to Ready", body:"x"}},
  {id:"DI_4", status:null, content:{__typename:"DraftIssue", title:"No column", body:"x"}},
  {id:"DI_5", status:{name:"Specced"}, content:{__typename:"DraftIssue", title:"Just a title", body:""}},
  {id:"I30", status:{name:"Specced"}, content:{__typename:"Issue", number:30, state:"OPEN", author:{login:"superhighfives"}, labels:{nodes:[{name:"kind:fix"}]}}},
  {id:"I31", status:{name:"Specced"}, content:{__typename:"Issue", number:31, state:"OPEN", author:{login:"superhighfives"}, labels:{nodes:[{name:"spec"}]}}},
  {id:"I32", status:{name:"Ready"}, content:{__typename:"Issue", number:32, state:"OPEN", author:{login:"superhighfives"}, labels:{nodes:[]}}},
  {id:"I33", status:{name:"Specced"}, content:{__typename:"Issue", number:33, state:"OPEN", author:{login:"stranger"}, labels:{nodes:[]}}},
  {id:"I34", status:{name:"Specced"}, content:{__typename:"Issue", number:34, state:"CLOSED", author:{login:"superhighfives"}, labels:{nodes:[]}}},
  {id:"I35", status:{name:"Ideas"}, content:{__typename:"Issue", number:35, state:"OPEN", author:{login:"superhighfives"}, labels:{nodes:[]}}},
  {id:"I36", status:{name:"Specced"}, content:{__typename:"Issue", number:36, state:"OPEN", author:{login:"superhighfives"}, labels:{nodes:[{name:"feedback"},{name:"needs-decision"}]}}}]' <<<"$BOARD")
draft_run() { # board_json -> convert_drafts and label_unspecced against it, with SPEC_COL read from it
  (
    echo 700 > "$tmp/issue-n"; rm -f "$tmp"/edit-body-*
    event() { echo "event $*" >> "$CALLS"; }
    gh() {
      echo "$*" >> "$CALLS"
      case "$1 $2" in
        "repo view") echo R_1 ;;
        "api graphql") local n; n=$(( $(cat "$tmp/issue-n") + 1 )); echo "$n" > "$tmp/issue-n"; echo "$n" ;;
        "issue edit") case "$*" in *--body-file*) cat > "$tmp/edit-body-$3" ;; esac ;;
        *) return 0 ;;
      esac
    }
    spec_column "$1"; convert_drafts "$1"; label_unspecced "$1"
  ) | sed -E 's/^[0-9-]+ [0-9:]+ //'
}
for b in Specced Define; do
  board="$DRAFT_BOARD"; [ "$b" = Define ] && board=$(define "$DRAFT_BOARD")
  : > "$CALLS"
  out=$(draft_run "$board")
  expect "$b: drafts in the column are converted, in board order"  "item=DI_2|item=DI_5" \
    "$(grep -oE 'item=DI_[0-9]+' "$CALLS" | paste -sd'|' -)"
  expect "$b: by the convert mutation, into this repo"             "yes yes"  "$(called 'convertProjectV2DraftIssueItemToIssue') $(called 'repo=R_1')"
  expect "$b: drafts in Ideas, Ready or no column aren't"          "no no no" "$(called DI_1) $(called DI_3) $(called DI_4)"
  expect "$b: each gets spec"                                      "yes yes"  "$(called 'issue edit 701 -R superhighfives/nylon-impossible --add-label spec --body-file -') $(called 'issue edit 702 -R superhighfives/nylon-impossible --add-label spec --body-file -')"
  expect "$b: and no kind yet, nor a board move"                   "no no"    "$(called 'kind:') $(called 'item-edit')"
  expect "$b: the draft's text, quoted under Problem" \
    "## Problem||> localeCompare sorts \"a\" after \"B\".|>|> See src/web/a.ts." "$(paste -sd'|' - < "$tmp/edit-body-701")"
  expect "$b: a draft with only a title says so" \
    "## Problem||(The draft had only its title.)" "$(paste -sd'|' - < "$tmp/edit-body-702")"
  expect "$b: logged" \
    "converted draft \"Web: sort positions by code point\" -> #701|converted draft \"Just a title\" -> #702" "$(grep '^converted' <<<"$out" | paste -sd'|' -)"
  expect "$b: with an event"                                       "yes yes"  "$(called 'event converted_draft 701') $(called 'event converted_draft 702')"
  expect "$b: the owner's issue in the column without spec gets it" "yes"     "$(called 'issue edit 30 -R superhighfives/nylon-impossible --add-label spec')"
  expect "$b: not one with spec, elsewhere, closed or a stranger's" "no no no no no" \
    "$(called 'issue edit 31') $(called 'issue edit 32') $(called 'issue edit 33') $(called 'issue edit 34') $(called 'issue edit 35')"
  expect "$b: nor one waiting on needs-decision"                    "no"      "$(called 'issue edit 36')"
done
: > "$CALLS"; DRY=1
expect "a dry run says what it would do" "would convert draft \"Web: sort positions by code point\"|would convert draft \"Just a title\"|would label #30 spec" \
  "$(draft_run "$DRAFT_BOARD" | paste -sd'|' -)"
DRY=0
expect "and does nothing"                "no no"  "$(called 'api graphql') $(called 'issue edit')"
: > "$CALLS"
failed_convert() {
  gh() { echo "$*" >> "$CALLS"; if [ "$1 $2" = "repo view" ]; then echo R_1; else return 1; fi; }
  spec_column "$DRAFT_BOARD"; convert_drafts "$DRAFT_BOARD"
}
expect "a failed conversion is retried next tick" "couldn't convert draft \"Just a title\"; retrying next tick" \
  "$( (failed_convert) | sed -E 's/^[0-9-]+ [0-9:]+ //' | tail -1)"
expect "and nothing is labelled" "no" "$(called 'issue edit')"
# The issue a conversion makes is the machine account's, which spec runs take.
CONVERTED_BOARD=$(jq -c '.items.nodes = [{id:"DI_2", status:{name:"Specced"}, content:{__typename:"Issue", number:701, state:"OPEN", author:{login:"nylon-foreman"}, labels:{nodes:[{name:"spec"}]}}}]' <<<"$BOARD")
expect "the converted issue gets spec runs"           "701"  "$(spec_issues "$CONVERTED_BOARD")"
expect "on a Define board too"                        "701"  "$(on_board "$(define "$CONVERTED_BOARD")" spec_issues "$(define "$CONVERTED_BOARD")")"
rm -rf "${SPECS:?}"; mkdir -p "$SPECS"; DRY=1; COMMENT_IDS=""
expect "a draft run first"  "would draft the spec for #701"  "$( (gh() { return 0; }; spec_pass "$CONVERTED_BOARD") | sed -E 's/^[0-9-]+ [0-9:]+ //')"
DRY=0

echo "the kind a draft picks"

(
  gh() { echo "$*" >> "$CALLS"; }
  kind() { echo "$1" > "$tmp/kind.json"; : > "$CALLS"; apply_kind 701 "$tmp/kind.json" >/dev/null; }
  kind '{"kind":"fix"}'
  expect "the run's kind becomes the label"     "yes"  "$(called 'issue edit 701 -R superhighfives/nylon-impossible --add-label kind:fix')"
  expect "and the result file is gone"          "no"   "$([ -e "$tmp/kind.json" ] && echo yes || echo no)"
  kind '{"kind":"kind:a11y"}'
  expect "written with its prefix, too"         "yes"  "$(called '--add-label kind:a11y')"
  kind '{"kind":"bug"}'
  expect "not one of the six: no label"         "no"   "$(called 'issue edit')"
  kind $'{"kind":"fix\\nbogus"}'
  expect "nor anything with more in it"         "no"   "$(called 'issue edit')"
  rm -f "$tmp/kind.json"; : > "$CALLS"; apply_kind 701 "$tmp/kind.json" >/dev/null
  expect "no result file: no label"             "no"   "$(called 'issue edit')"
  trusted_comments() { :; }
  expect "the prompt asks for one when there's a file"  "yes"  "$(spec_prompt 701 draft "$tmp/kind.json" | grep -qF "write \`{\"kind\": \"<kind>\"}\` to" && echo yes)"
  # shellcheck disable=SC2016 # the backticks are markdown
  expect "with all six"                                 "yes"  "$(spec_prompt 701 draft "$tmp/kind.json" | tr '\n' ' ' | grep -qF '`feature`, `fix`, `refactor`, `a11y`, `test` or `chore`' && echo yes)"
  expect "and not otherwise"                            "no"   "$(spec_prompt 701 revise "" | grep -qF 'kind:*' && echo yes || echo no)"
)

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
expect "another label's events don't count"        ""  "$(owner_added auto-fix <<<"[$(autofix 1 labeled superhighfives | jq -c '.label.name = "spec"')]")"

FB_BOARD='{"id":"P","field":{"id":"F","options":[{"id":"o-ideas","name":"Ideas"},{"id":"o-specced","name":"Specced"},{"id":"o-ready","name":"Ready"},{"id":"o-progress","name":"In progress"},{"id":"o-review","name":"In review"}]},"items":{"nodes":[
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

# ---- routines ----------------------------------------------------------------

echo "routine schedules"

H=3600 D=86400
SUN8=$FOREMAN_NOW SUN3=$((FOREMAN_NOW - 5 * 3600))
MON9=$((SUN8 + D + H)) THU3=$((SUN3 + 4 * D))
rm -rf "${ROUTINES:?}"; mkdir -p "$ROUTINES"
due() { # name now last-run (empty: never) -> yes or no
  if [ -n "$3" ]; then echo "$3" > "$ROUTINES/$1"; else rm -f "${ROUTINES:?}/${1:?}"; fi
  if FOREMAN_NOW=$2 routine_due "$1"; then echo yes; else echo no; fi
}
expect "digest: due at 08:00"                         yes "$(due digest "$SUN8" $((SUN8 - D + 300)))"
expect "digest: not at 07:59"                         no  "$(due digest $((SUN8 - 60)) $((SUN8 - D + 300)))"
expect "digest: once a window, across ticks"          no  "$(due digest $((SUN8 + 2 * H)) $((SUN8 + 600)))"
expect "digest: due again the next morning"           yes "$(due digest $((SUN8 + D)) $((SUN8 + 600)))"
expect "never run: due"                               yes "$(due digest "$SUN8" "")"
expect "sentry: due from 03:00"                       yes "$(due sentry "$SUN3" $((SUN3 - D + 600)))"
expect "sentry: not at 02:59"                         no  "$(due sentry $((SUN3 - 60)) $((SUN3 - D + 600)))"
expect "sentry: ran at 03:10, so not again that day"  no  "$(due sentry $((SUN3 + 20 * H)) $((SUN3 + 600)))"
expect "deps: not on a Sunday"                        no  "$(due deps "$SUN8" $((MON9 - 7 * D + 600)))"
expect "deps: not at 08:59 on Monday"                 no  "$(due deps $((MON9 - 60)) $((MON9 - 7 * D + 600)))"
expect "deps: Monday at 09:00"                        yes "$(due deps "$MON9" $((MON9 - 7 * D + 600)))"
expect "deps: a Monday missed runs on Tuesday"        yes "$(due deps $((MON9 + D)) $((MON9 - 7 * D + 600)))"
expect "deps: once that week"                         no  "$(due deps $((MON9 + 3 * D)) $((MON9 + 600)))"
expect "scout: Thursday at 03:00"                     yes "$(due scout "$THU3" $((THU3 - 7 * D + 600)))"
expect "scout: not on Wednesday"                      no  "$(due scout $((THU3 - D)) $((THU3 - 7 * D + 600)))"
expect "dispatch: every tick"                         yes "$(due dispatch "$SUN8" "$SUN8")"
expect "the next digest is tomorrow at 08:00"         $((SUN8 + D))  "$(sched_time $((SUN8 + 600)) 8 '*' next)"
expect "the next bundle is Monday at 09:00"           "$MON9"        "$(sched_time "$SUN8" 9 1 next)"
# 2026-11-01 is the day the US leaves daylight time: 03:00 is still 03:00.
expect "local time, across a clock change"  "2026-11-01 03:00" \
  "$(TZ=America/Los_Angeles perl -MPOSIX=strftime -e 'print strftime("%F %H:%M", localtime shift)' "$(TZ=America/Los_Angeles sched_time $((SUN8 + 12 * H)) 3 '*' prev)")"

echo "routine off switch"

rm -f "${ROUTINES:?}"/*.off
off() { if routine_off "$1" "$2"; then echo off; else echo on; fi; }
expect "FOREMAN_ROUTINES_OFF turns off the named one"  off "$(off digest 'sentry, digest')"
expect "and not the others"                            on  "$(off deps 'sentry, digest')"
expect "names match exactly"                           on  "$(off sentry 'sentry-old')"
expect "an empty variable turns nothing off"           on  "$(off sentry '')"
cmd_routine scout off >/dev/null
expect "foreman routine scout off turns it off here"   off "$(off scout '')"
expect "and only it"                                   on  "$(off sentry '')"
cmd_routine scout on >/dev/null
expect "and on turns it back on"                       on  "$(off scout '')"
expect "an unknown routine is refused"                 1   "$( (cmd_routine nope off) >/dev/null 2>&1; echo $?)"
expect "dispatch's old name, shepherd, is still off in the variable"  off "$(off dispatch 'shepherd')"
touch "$ROUTINES/shepherd.off"
expect "and with an old off marker here"               off "$(off dispatch '')"
rm -f "$ROUTINES/shepherd.off"
cmd_routine shepherd off >/dev/null
expect "foreman routine shepherd off turns dispatch off"  off "$(off dispatch '')"
cmd_routine shepherd on >/dev/null
touch "$ROUTINES/shepherd.off"
cmd_routine dispatch on >/dev/null
expect "dispatch on clears the old shepherd off marker" on "$(off dispatch '')"

echo "routines pass"

# What ran, in order, with the routines themselves stubbed out.
pass_run() { # now off-variable open-agent-PRs -> the routines that ran
  (
    OFFV=$2 OPENV=$3
    routines_off_var() { echo "$OFFV"; }
    agent_pr_count() { echo "$OPENV"; }
    run_routine() { echo "$2" >> "$tmp/ran"; now > "$ROUTINES/$2"; if model_routine "$2"; then USED_MODEL=1; fi; }
    deps_tidy() { echo tidy >> "$tmp/ran"; }
    : > "$tmp/ran"
    FOREMAN_NOW=$1 routines_pass '{}' >/dev/null
    paste -sd' ' "$tmp/ran"
  )
}
rm -rf "${ROUTINES:?}"; mkdir -p "$ROUTINES"
expect "one model-driven routine a tick; the shell ones as well"  "dispatch sentry digest tidy"  "$(pass_run "$SUN8" "" 0)"
expect "with 5 agent PRs open, the bundle waits"                  "dispatch scout tidy"          "$(pass_run "$SUN8" "" 5)"
expect "and stays due"                                            "dispatch tidy"                "$(pass_run "$SUN8" "" 5)"
expect "until there's room"                                       "dispatch deps tidy"           "$(pass_run "$SUN8" "" 4)"
expect "then nothing more in this window"                         "dispatch tidy"                "$(pass_run "$SUN8" "" 0)"
rm -rf "${ROUTINES:?}"; mkdir -p "$ROUTINES"
expect "the variable stops exactly the ones it names"             "sentry"                       "$(pass_run "$SUN8" "dispatch,digest,deps" 0)"
expect "and they stay due"                                        "no"                           "$([ -e "$ROUTINES/digest" ] && echo yes || echo no)"
touch "$ROUTINES/scout.off"
expect "a local off marker stops exactly that one"                "dispatch deps digest tidy"    "$(pass_run "$SUN8" "" 0)"
rm -f "${ROUTINES:?}/scout.off"

tick_routines() { # paused-variable -> whether a tick reached the routines
  (
    PAUSEDV=$1
    use_token() { :; }; ensure_clone() { :; }; self_update() { :; }; board_json() { echo '{}'; }
    merge_pass() { :; }; cleanup_worktrees() { :; }; spec_pass() { :; }; agent_pr_count() { echo 3; }
    spec_column() { :; }; convert_drafts() { :; }; label_unspecced() { :; }
    gh() { case "$*" in "variable get FOREMAN_PAUSED"*) echo "$PAUSEDV" ;; esac; }
    routines_pass() { touch "$tmp/tick-routines"; }
    rm -f "$tmp/tick-routines"
    cmd_tick >/dev/null 2>&1
    [ -e "$tmp/tick-routines" ] && echo yes || echo no
  )
}
expect "FOREMAN_PAUSED stops every routine"   no  "$(tick_routines 1)"
expect "otherwise a tick runs them"           yes "$(tick_routines "")"

echo "agent PRs"

PRS_JSON='[{"number":80,"headRefName":"foreman/12-x","author":{"login":"nylon-foreman"}},
  {"number":81,"headRefName":"feedback/568","author":{"login":"superhighfives"}},
  {"number":82,"headRefName":"foreman/13-y","author":{"login":"stranger"}},
  {"number":83,"headRefName":"dependabot/bun/x","author":{"login":"app/dependabot"}},
  {"number":84,"headRefName":"foreman/deps-2026-11-02","author":{"login":"nylon-foreman"}}]'
expect "foreman/* and feedback/*, by the owner or the machine account"  "80 81 84"  "$(pick_agent_prs <<<"$PRS_JSON" | cut -f1 | paste -sd' ' -)"

echo "dispatch"

operator_job() { # pr working-dir [token-file] -> an operator plist for the PR, as `operator install` writes it
  local env=""
  [ -z "${3:-}" ] || env="<key>OPERATOR_GH_TOKEN_FILE</key><string>$3</string>"
  printf '<plist><dict><key>EnvironmentVariables</key><dict><key>PATH</key><string>/bin</string>%s</dict><key>WorkingDirectory</key><string>%s</string></dict></plist>\n' \
    "$env" "$2" > "$FOREMAN_OPERATOR_PLISTS/com.operator.superhighfives-nylon-impossible-$1.plist"
}
(
  AGENT_PRS=$'79\tforeman/11-w\n80\tforeman/12-x\n81\tfeedback/568' AGENT_FAIL=""
  agent_prs() { [ -z "$AGENT_FAIL" ] || return 1; echo "$AGENT_PRS"; }
  dispatch_worktree() { echo "$tmp/wt-$1"; }
  operator() { echo "operator $*" >> "$CALLS"; }
  : > "$CALLS"; rm -rf "${DISPATCH:?}" "$FOREMAN_HOME/shepherd" "${FOREMAN_OPERATOR_PLISTS:?}"
  mkdir -p "$FOREMAN_OPERATOR_PLISTS" "$FOREMAN_HOME/shepherd" "$tmp/wt-79"
  operator_job 80 "$tmp/wt-80" "$TOKEN_FILE"
  operator_job 79 "$tmp/wt-79" # from before the token flag
  touch "$FOREMAN_HOME/shepherd/70" # the shepherd's state, from before the rename
  dispatch >/dev/null
  expect "the shepherd's state moves to dispatch"         "no yes"  "$([ -e "$FOREMAN_HOME/shepherd" ] && echo yes || echo no) $([ -d "$DISPATCH" ] && echo yes)"
  expect "an operator goes on an agent PR without a job, as the machine account" \
    yes "$(called "operator install 81 -C $tmp/wt-81 --runner claude --gh-token-file $TOKEN_FILE")"
  expect "not on one that has one"                        no  "$(called 'operator install 80')"
  expect "a job without the token is rewritten, in its own checkout" \
    yes "$(called "operator install 79 -C $tmp/wt-79 --runner claude --gh-token-file $TOKEN_FILE")"
  expect "but isn't counted as dispatch's"                no  "$([ -e "$DISPATCH/79" ] && echo yes || echo no)"
  expect "and it's remembered as dispatch's"              yes "$([ -e "$DISPATCH/81" ] && echo yes)"
  expect "a closed PR's job is stopped"                   yes "$(called 'operator stop superhighfives-nylon-impossible-70 --purge')"
  expect "and forgotten"                                  no  "$([ -e "$DISPATCH/70" ] && echo yes || echo no)"
  : > "$CALLS"; operator_job 79 "$tmp/wt-79" "$TOKEN_FILE"
  dispatch >/dev/null
  expect "once it has the token, it's left alone"         no  "$(called 'operator install 79')"
  : > "$CALLS"; AGENT_FAIL=1
  dispatch >/dev/null
  expect "when GitHub can't say what's open, no job is touched"  no  "$(called 'operator')"
)

echo "shots after any push"

mk ios-change 'mkdir -p src/ios && echo x > src/ios/App.swift'
g push -q -f origin "$(case_sha ios-change):refs/heads/foreman/90-ios" "$(case_sha plain):refs/heads/foreman/91-web"
SHOTS_BODY=$'## Try it\n\n<!-- fix-shots:start -->\n### Before / after\n\n_From `main` at 1111111 and this branch at '"${BASE:0:7}"$'._\n\n<!-- fix-shots:plan {"shots":[]} -->\n<!-- fix-shots:end -->'
(
  gh() { # pr list: two agent PRs whose shots were taken at base
    jq -cn --arg b "$SHOTS_BODY" --arg ios "$(case_sha ios-change)" --arg web "$(case_sha plain)" '[
      {number:90, headRefName:"foreman/90-ios", headRefOid:$ios, author:{login:"nylon-foreman"}, body:$b},
      {number:91, headRefName:"foreman/91-web", headRefOid:$web, author:{login:"nylon-foreman"}, body:$b},
      {number:92, headRefName:"foreman/92-none", headRefOid:$ios, author:{login:"nylon-foreman"}, body:"No shots."}]'
  }
  retake_shots() { echo "retake $*" >> "$CALLS"; }
  : > "$CALLS"; rm -rf "${SHOTS:?}"
  expect "the shots' commit is read from the PR body"    "${BASE:0:7}"  "$(shots_sha <<<"$SHOTS_BODY")"
  shots_pass >/dev/null
  expect "a push that changed src/ios retakes the shots"  yes "$(called 'retake 90 90 foreman/90-ios')"
  expect "one that didn't, doesn't"                       no  "$(called 'retake 91')"
  expect "nor does a PR with no shots"                    no  "$(called 'retake 92')"
  : > "$CALLS"
  shots_pass >/dev/null
  expect "once per head commit"                           no  "$(called 'retake 90')"
  expect "a feedback branch's issue is its number"        568 "$(pr_issue feedback/568)"
)

echo "routine prompts"

# Each prompt names the file its results go in; set -u catches a prompt
# written before that's known, which would otherwise reach Claude cut short.
prompt_of() { # routine -> its prompt, written the way the routine writes it
  set -u; unset ROUTINE_OUT; routine_out "$1"
  case "$1" in
    sentry) sentry_prompt "NYLON-IMPOSSIBLE-API-1" ;;
    scout)  scout_prompt "A title" ;;
    deps)   deps_prompt foreman/deps-2026-11-02 "#1 Bump x" ;;
  esac
}
for r in sentry scout deps; do
  out=$( (prompt_of "$r") 2>&1 )
  expect "the $r prompt is whole and names its result file"  "yes"  "$(grep -qF "$ROUTINES/out/$r/result.json" <<<"$out" && ! grep -q 'unbound variable' <<<"$out" && echo yes)"
done

echo "read-only routines"

flags_of() { (set -u; routine_out "$1"; read_only_args "$@"; printf '%s\n' "${READ_ONLY_ARGS[@]}") 2>&1; }
for r in sentry scout; do
  out=$(flags_of "$r")
  expect "$r runs restricted, with no bypass"  "yes"  "$(grep -qx -- --restricted <<<"$out" && grep -qx dontAsk <<<"$out" && ! grep -q bypassPermissions <<<"$out" && echo yes)"
  expect "$r may write only its result directory"  "Edit(/$ROUTINES/out/$r/**)"  "$(grep '^Edit' <<<"$out")"
  expect "$r gets no shell, web or Sentry write tool"  ""  "$(grep -E '^(Bash|WebFetch|Write)|execute_sentry_tool|update_issue' <<<"$out")"
done
expect "only sentry gets the Sentry MCP"  "1 0"  "$(flags_of sentry | grep -c mcp.sentry.dev) $(flags_of scout | grep -c mcp.sentry.dev || true)"

echo "the Sentry sweep"

sentry_item() { # short-id [incomplete|nameless] -> one proposed issue
  local body="${SPEC_OK/It breaks./$1 crashes the app for 12 users.}"
  body="${body/None./1. Retry, or fail?}"
  case "${2:-}" in incomplete) body="${body/How to verify/Verify}" ;; nameless) body="${SPEC_OK/None./1. ?}" ;; esac
  jq -cn --arg s "$1" --arg b "$body" '{short_id:$s, title:("Crash: " + $s), body:$b, questions:"1. Retry, or fail? Recommend retry."}'
}
SENTRY_RESULT="$tmp/sentry.json"
jq -n --argjson items "[$(sentry_item NYLON-API-1),$(sentry_item NYLON-API-2),$(sentry_item NYLON-API-3),$(sentry_item NYLON-API-4),
  $(sentry_item NYLON-API-9 incomplete),$(sentry_item NYLON-API-10 nameless),$(sentry_item lowercase-1),$(sentry_item NYLON-API-1),
  $(sentry_item NYLON-API-5),$(sentry_item NYLON-API-6),$(sentry_item NYLON-API-7),$(sentry_item NYLON-API-8)]" \
  '{issues:$items, skipped:[{short_id:"NYLON-WEB-3", reason:"a browser extension"}]}' > "$SENTRY_RESULT"
(
  echo 600 > "$tmp/issue-n"
  gh() {
    echo "$*" >> "$CALLS"
    case "$1 $2" in
      "issue list")
        case "$*" in
          *NYLON-API-2*) echo '[{"number":77,"state":"OPEN","closedAt":null}]' ;;
          *NYLON-API-3*) echo '[{"number":78,"state":"CLOSED","closedAt":"2026-10-20T00:00:00Z"}]' ;;
          *NYLON-API-4*) echo '[{"number":79,"state":"CLOSED","closedAt":"2026-08-01T00:00:00Z"}]' ;;
          *) echo '[]' ;;
        esac ;;
      "issue create") local n; n=$(( $(cat "$tmp/issue-n") + 1 )); echo "$n" > "$tmp/issue-n"; echo "https://github.com/superhighfives/nylon-impossible/issues/$n" ;;
      "project item-add") echo ITEM ;;
      *) return 0 ;;
    esac
  }
  : > "$CALLS"; : > "$EVENTS"; rm -rf "${SPECS:?}"
  file_sentry_issues "$FB_BOARD" "$SENTRY_RESULT" >/dev/null
  expect "at most 5 issues a night"                        5    "$(grep -c '^issue create' "$CALLS")"
  expect "the ones it filed"                               "NYLON-API-1 NYLON-API-4 NYLON-API-5 NYLON-API-6 NYLON-API-7" \
    "$(jq -r 'select(.event == "routine") | .filed[] | sub("^#[0-9]+ Crash: "; "")' "$EVENTS" | paste -sd' ' -)"
  expect "labelled kind:fix and spec"                      yes  "$(called 'issue create -R superhighfives/nylon-impossible --title Crash: NYLON-API-1 --label kind:fix --label spec')"
  expect "its questions are its first comment"             yes  "$(called 'issue comment 601')"
  expect "marked as drafted, so the spec pass waits"       0    "$(cat "$SPECS/601")"
  expect "and it lands in Specced"                         5    "$(grep -c 'single-select-option-id o-specced' "$CALLS")"
  expect "never Ready"                                     no   "$(called 'o-ready')"
  note=$(jq -r 'select(.event == "routine") | .note' "$EVENTS")
  expect "an open issue with its short ID: skipped"        yes  "$(grep -qF 'NYLON-API-2: already in #77' <<<"$note" && echo yes)"
  expect "and one closed recently"                         yes  "$(grep -qF 'NYLON-API-3: already in #78' <<<"$note" && echo yes)"
  expect "a spec missing a section isn't filed"            yes  "$(grep -qF 'NYLON-API-9: not a complete spec' <<<"$note" && echo yes)"
  expect "nor one whose body doesn't name its short ID"    yes  "$(grep -qF "NYLON-API-10: the body doesn't name it" <<<"$note" && echo yes)"
  expect "won't-fix reasons go in the event"               yes  "$(grep -qF "won't fix: NYLON-WEB-3: a browser extension" <<<"$note" && echo yes)"
  expect "not on GitHub"                                   no   "$(called 'browser extension')"
  : > "$CALLS"; DRY=1
  file_sentry_issues "$FB_BOARD" "$SENTRY_RESULT" >/dev/null
  DRY=0
  expect "a dry run files nothing"                         no   "$(called 'issue create')"
)

echo "the scout"

(
  gh() { echo "$*" >> "$CALLS"; case "$1 $2" in "project item-create") echo "DI_$RANDOM" ;; *) return 0 ;; esac; }
  scout_item() { jq -cn --arg t "$1" '{title:$t, body:"src/web/a.ts:12 and src/ios/A.swift:30 disagree."}'; }
  jq -n --argjson items "[$(scout_item 'Drop the unused Pill styles'),$(scout_item '  fix   REORDERING on the web board'),$(scout_item ''),
    $(scout_item 'One'),$(scout_item 'Two'),$(scout_item 'Three'),$(scout_item 'Four'),$(scout_item 'Five')]" '{items:$items}' > "$tmp/scout.json"
  : > "$CALLS"; : > "$EVENTS"
  file_scout_items "$FB_BOARD" "$tmp/scout.json" "Fix reordering on the web board" >/dev/null
  expect "at most 5 draft items a week"                   5    "$(grep -c '^project item-create' "$CALLS")"
  expect "none matching a title already there"            no   "$(called 'REORDERING')"
  expect "drafts in Ideas"                                5    "$(grep -c 'single-select-option-id o-ideas' "$CALLS")"
  expect "no issues, no labels"                           no   "$(called 'issue ')"
  expect "what it filed is in the event"                  "Drop the unused Pill styles|One|Two|Three|Four"  "$(jq -r '.filed | join("|")' "$EVENTS")"
)

echo "the bundle"

MERGED_JSON='[{"number":90,"headRefName":"foreman/deps-2026-10-26","author":{"login":"nylon-foreman"},"body":"- #55 Bump x\n- #56 Bump y","mergedAt":"2026-10-27T00:00:00Z"},
  {"number":91,"headRefName":"foreman/deps-2026-11-02","author":{"login":"stranger"},"body":"- #57","mergedAt":"2026-11-02T00:00:00Z"},
  {"number":92,"headRefName":"foreman/12-x","author":{"login":"nylon-foreman"},"body":"- #58","mergedAt":"2026-11-02T00:00:00Z"}]'
expect "the bundle that named the PR"                 90  "$(bundle_for 55 <<<"$MERGED_JSON")"
expect "#5 isn't #55"                                 ""  "$(bundle_for 5 <<<"$MERGED_JSON")"
expect "only the machine account's foreman/deps-*"    ""  "$(bundle_for 57 <<<"$MERGED_JSON")$(bundle_for 58 <<<"$MERGED_JSON")"

g checkout -q main
g pull -q origin main 2>/dev/null
echo "lock 1" > "$tmp/seed/bun.lock"; g add -A && g commit -qm lock && g push -q origin HEAD:main
g checkout -q -B dependabot/x
echo "dep 2.0" >> "$tmp/seed/src/web/app.ts"; echo "lock 2" > "$tmp/seed/bun.lock"
g commit -qam "Bump dep" && g push -q origin HEAD:refs/heads/dependabot/x
DEP_SHA=$(g rev-parse HEAD)
g checkout -q -B lockonly main && echo "lock 9" > "$tmp/seed/bun.lock" && g commit -qam lock-only && g push -q origin HEAD:refs/heads/lockonly
LOCK_SHA=$(g rev-parse HEAD)
fetch_all
superseded "$DEP_SHA"
expect "a bump main doesn't have isn't superseded"    1  "$?"
g checkout -q main && echo "dep 2.0" >> "$tmp/seed/src/web/app.ts" && echo "lock 3" > "$tmp/seed/bun.lock"
g commit -qam "Bundle" && g push -q origin HEAD:main
fetch_all
superseded "$DEP_SHA"
expect "once the bundle is on main, it is, whatever the lockfile says"  0  "$?"
superseded "$LOCK_SHA"
expect "a lockfile-only change is never closed"      1  "$?"

echo "the digest"

cat > "$EVENTS" <<'JSONL'
{"ts":"2026-10-30T09:00:00Z","event":"failed","issue":1,"pr":null,"note":"exit 1"}
{"ts":"2026-10-31T09:00:00Z","event":"failed","issue":40,"pr":null,"note":"exit 2"}
{"ts":"2026-10-31T10:00:00Z","event":"spec_failed","issue":41,"pr":null,"note":"exit 1"}
{"ts":"2026-10-31T11:00:00Z","event":"round_stalled","issue":42,"pr":142,"note":""}
{"ts":"2026-10-31T12:00:00Z","event":"routine","issue":null,"pr":null,"routine":"deps","outcome":"failed","note":"exit 124","filed":[]}
{"ts":"2026-10-31T13:00:00Z","event":"routine","issue":null,"pr":null,"routine":"scout","outcome":"ok","note":"1 idea(s)","filed":["Drop the unused Pill styles"]}
{"ts":"2026-10-29T03:10:00Z","event":"routine","issue":null,"pr":null,"routine":"scout","outcome":"ok","note":"","filed":["An old idea"]}
{"ts":"2026-10-31T14:00:00Z","event":"merged","issue":43,"pr":143,"note":""}
{"ts":"2026-11-01T03:10:00Z","event":"routine","issue":null,"pr":null,"routine":"sentry","outcome":"ok","note":"X: won't fix","filed":["#601 Crash on save"]}
{"ts":"2026-11-01T03:20:00Z","event":"routine","issue":null,"pr":null,"routine":"shepherd","outcome":"ok","note":"","filed":["#80"]}
JSONL
DAY_AGO=$((SUN8 - 86400))
expect "found: what the Sentry sweep and the scout filed, in the last day" \
  "- Scout, in Ideas: Drop the unused Pill styles|- Sentry: #601 Crash on save" "$(digest_found "$DAY_AGO" | paste -sd'|' -)"
expect "problems: failed builds, spec runs, rounds and routines, in the last day" \
  "- The build of #40 stopped without a PR (exit 2)|- The spec run for #41 failed (exit 1)|- A review round on #142 changed nothing|- Routine deps failed (exit 124)" \
  "$(digest_problems "$DAY_AGO" | paste -sd'|' -)"
expect "and a token about to expire"  "- Token: expires soon"  "$(digest_problems "$DAY_AGO" "expires soon" | tail -1)"

DIGEST_BOARD=$(jq -c '.items.nodes = [
  {id:"I51", status:{name:"Specced"}, content:{__typename:"Issue", number:51, title:"Crash on save", state:"OPEN", author:{login:"nylon-foreman"}, labels:{nodes:[{name:"spec"},{name:"kind:fix"}]}}},
  {id:"I52", status:{name:"Specced"}, content:{__typename:"Issue", number:52, title:"Pick a colour", state:"OPEN", author:{login:"superhighfives"}, labels:{nodes:[{name:"spec"},{name:"needs-decision"}]}}}]' <<<"$FB_BOARD")
D_MERGED='[{"number":143,"title":"Fix save","body":"Closes #43.\n\nAlso fixes #44","mergedAt":"2026-10-31T14:00:00Z"},
  {"number":140,"title":"Old","body":"","mergedAt":"2026-10-30T00:00:00Z"}]'
D_ND='[{"number":52,"title":"Pick a colour"}]' D_OM='[{"number":144,"title":"Bundle dependabot updates"}]'
gh() { # applies --jq itself, like gh
  local out jqf="" prev="" a
  for a in "$@"; do [ "$prev" = --jq ] && jqf="$a"; prev="$a"; done
  echo "$*" >> "$CALLS"
  case "$1 $2" in
    "pr list")
      case "$*" in *"--state merged"*) out="$D_MERGED" ;; *owner-merge*) out="$D_OM" ;; *) out='[]' ;; esac ;;
    "issue list")
      case "$*" in *needs-decision*) out="$D_ND" ;; *) out='[]' ;; esac ;;
    "issue view") out=$(jq -cn --arg b "${SPEC_OK/None./1. Retry?}" '{body:$b}') ;;
    *) return 0 ;;
  esac
  if [ -n "$jqf" ]; then jq -r "$jqf" <<<"$out"; else echo "$out"; fi
}
TOKEN_CODE=0
body=$(digest_body "$DIGEST_BOARD")
expect "four sections"                         "### Merged|### Waiting on you|### Found|### Problems"  "$(grep '^### ' <<<"$body" | paste -sd'|' -)"
expect "merged in the last day, with issues"   "- #143 Fix save (#43, #44)"  "$(sed -n '/### Merged/,/###/p' <<<"$body" | grep '^- ')"
expect "waiting: decisions, merges and specs"  "- #52 Pick a colour: needs your decision|- #144 Bundle dependabot updates: yours to merge|- #51 Crash on save: its spec has questions for you" \
  "$(sed -n '/### Waiting on you/,/### Found/p' <<<"$body" | grep '^- ' | paste -sd'|' -)"
expect "the same on a Define board"            "- #51 Crash on save: its spec has questions for you" \
  "$(on_board "$(define "$DIGEST_BOARD")" digest_waiting "$(define "$DIGEST_BOARD")" | grep spec)"

# The HTML part: escaped, then linked, so a title can't add markup.
html=$(printf '%s\n' '**Sunday 1 November**: the last 24 hours.' '' '### Merged' '' '- #143 Use <b> & </b> (#43)' '' '### Found' '' 'None.' | digest_html)
expect "every #n links to its issue" \
  '<li><a href="https://github.com/superhighfives/nylon-impossible/issues/143">#143</a> Use &lt;b&gt; &amp; &lt;/b&gt; (<a href="https://github.com/superhighfives/nylon-impossible/issues/43">#43</a>)</li>' \
  "$(grep '<li>' <<<"$html")"
expect "a heading per section, and a list of its lines"  "<h2>Merged</h2>|<ul>|<li>|</ul>|<h2>Found</h2>|<p>None.</p>" \
  "$(grep -oE '^<(h2|ul|li|/ul|p)>(Merged|Found|None\.)?(</h2>|</p>)?' <<<"$html" | sed -n '2,$p' | paste -sd'|' -)"
expect "the date line"  "<p><strong>Sunday 1 November</strong>: the last 24 hours.</p>"  "$(sed -n 3p <<<"$html")"
expect "a title can't inject a tag"  no  "$(grep -q '<b>' <<<"$html" && echo yes || echo no)"

# Sending, with curl stubbed: CURL_OUT is the response body, CURL_CODE its status.
export FOREMAN_CF_TOKEN_FILE="$tmp/cf-token"; CF_TOKEN_FILE="$FOREMAN_CF_TOKEN_FILE"
CURL_OUT='{"success":true,"errors":[],"messages":[],"result":{"delivered":["hi@charliegleason.com"],"permanent_bounces":[],"queued":[]}}'
CURL_CODE=200
curl() {
  local prev="" a
  echo "curl $*" >> "$CALLS"
  for a in "$@"; do [ "$prev" = -H ] && case "$a" in @*) cat "${a#@}" > "$tmp/curl-header" ;; esac; prev="$a"; done
  cat > "$tmp/curl-body"
  printf '%s\n%s' "$CURL_OUT" "$CURL_CODE"
}
digest_ok() { tail -n 1 "$EVENTS" | jq -r '"\(.routine) \(.outcome) \(.note)"'; }

: > "$CALLS"; rm -f "$CF_TOKEN_FILE"
expect_prefix "the dry run prints the email"  "Nylon digest: Sunday 1 November" \
  "$(DRY=1 routine_digest "$DIGEST_BOARD" | grep -o 'Nylon digest: .*')"
dry_out=$(DRY=1 routine_digest "$DIGEST_BOARD")
expect "from and to"                    yes  "$(grep -qF 'from Nylon foreman <foreman@superhighfives.com> to hi@charliegleason.com' <<<"$dry_out" && echo yes || echo no)"
expect "both parts, with all four sections"  "4 4"  "$(grep -c '| ### ' <<<"$dry_out") $(grep -c '| <h2>' <<<"$dry_out")"
expect "and says the token file is missing"  yes  "$(grep -qF "no $CF_TOKEN_FILE" <<<"$dry_out" && echo yes || echo no)"
expect "without sending anything"       no   "$(called 'curl ')"

: > "$CALLS"
routine_digest "$DIGEST_BOARD" >/dev/null
expect "no token file: it fails, with the reason"  "digest failed no token file"  "$(digest_ok)"
expect "and alerts"                     yes  "$(called 'alert routine digest failed (no token file)')"
expect "without calling Cloudflare"     no   "$(called 'curl ')"
expect "and the next digest lists it"   "- Routine digest failed (no token file)"  "$(digest_problems "$DAY_AGO" | grep 'Routine digest')"

echo "cf-secret" > "$CF_TOKEN_FILE"; chmod 600 "$CF_TOKEN_FILE"
: > "$CALLS"
routine_digest "$DIGEST_BOARD" >/dev/null
expect "a send logs the API's result"   'digest ok {"delivered":["hi@charliegleason.com"],"permanent_bounces":[],"queued":[]}'  "$(digest_ok)"
expect "to the account's send endpoint"  yes  "$(called 'curl -sS -X POST https://api.cloudflare.com/client/v4/accounts/1f12960834ae2c36ac08812df07167c2/email/sending/send')"
expect "with the token in a header file" "Authorization: Bearer cf-secret"  "$(cat "$tmp/curl-header")"
expect "never as an argument"           no   "$(called 'cf-secret')"
expect "the envelope"                   'Nylon foreman foreman@superhighfives.com hi@charliegleason.com Nylon digest: Sunday 1 November' \
  "$(jq -r '"\(.from.name) \(.from.address) \(.to) \(.subject)"' "$tmp/curl-body")"
expect "a text and an HTML part"        "yes yes" \
  "$(jq -r '"\(.text | startswith("**Sunday 1 November**") | if . then "yes" else "no" end) \(.html | contains("<h2>Problems</h2>") | if . then "yes" else "no" end)"' "$tmp/curl-body")"
expect "nothing on GitHub, and no alert"  "no no no"  "$(called 'issue create') $(called 'issue comment') $(called 'alert ')"

: > "$CALLS"; CURL_OUT='{"success":true,"result":{"delivered":[],"permanent_bounces":[],"queued":["Hi@CharlieGleason.com"]}}'
routine_digest "$DIGEST_BOARD" >/dev/null
expect "queued counts as sent"          "digest ok"  "$(digest_ok | cut -d' ' -f1,2)"

: > "$CALLS"; CURL_OUT='{"success":true,"result":{"delivered":[],"permanent_bounces":["hi@charliegleason.com"],"queued":[]}}'
routine_digest "$DIGEST_BOARD" >/dev/null
expect "a bounce is a failure"          "digest failed bounced"  "$(digest_ok)"

: > "$CALLS"; CURL_CODE=403 CURL_OUT='{"success":false,"errors":[{"code":10000,"message":"Authentication error"}],"result":null}'
routine_digest "$DIGEST_BOARD" >/dev/null
expect "an API error fails with its message"  "digest failed Cloudflare 403: Authentication error"  "$(digest_ok)"
expect "and alerts"                     yes  "$(called 'alert routine digest failed (Cloudflare 403: Authentication error)')"
expect "and posts nothing to GitHub"    "no no"  "$(called 'issue create') $(called 'issue comment')"

: > "$CALLS"; CURL_CODE=200 CURL_OUT='{"success":false,"errors":[{"code":10001,"message":"email.sending.error.invalid_request_schema"}],"result":null}'
routine_digest "$DIGEST_BOARD" >/dev/null
expect "success: false is a failure too"  "digest failed Cloudflare 200: email.sending.error.invalid_request_schema"  "$(digest_ok)"

: > "$CALLS"; CURL_CODE=000 CURL_OUT=''
routine_digest "$DIGEST_BOARD" >/dev/null
expect "no answer is a failure"         "digest failed Cloudflare didn't answer"  "$(digest_ok)"

: > "$EVENTS"; D_MERGED='[]' D_ND='[]' D_OM='[]'
EMPTY_BOARD=$(jq -c '.items.nodes = []' <<<"$FB_BOARD")
: > "$CALLS"
expect "nothing to say: no body"               ""   "$(digest_body "$EMPTY_BOARD")"
CURL_CODE=200
routine_digest "$EMPTY_BOARD" >/dev/null
expect "so no email"                           no   "$(called 'curl ')"
expect "and no alert"                          no   "$(called 'alert ')"
expect "it logs nothing to say"                "digest ok nothing to say"  "$(digest_ok)"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
