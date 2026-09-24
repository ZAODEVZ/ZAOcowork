#!/usr/bin/env bash
# rls-test.sh - prove migrations 028 + 029 against a LOCAL throwaway Postgres
# holding a copy of the pre-028 state (fixture-pre-028.sql). Nothing here
# touches the live project: it starts its own cluster on 127.0.0.1 and a random
# port, and stops it on exit.
#
#   supabase/checks/rls-test.sh              run everything
#   SKIP_029=1 supabase/checks/rls-test.sh   red control: 029 not applied, so
#                                            its assertions must FAIL
#
# Needs Postgres server binaries (initdb, pg_ctl, psql). Set PG_BIN, or have
# pg_config on PATH, or Homebrew's postgresql@NN. None found = exit 2, CANNOT
# RUN - a missing verifier is not a pass.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../migrations"

PG_BIN="${PG_BIN:-}"
if [[ -z "$PG_BIN" ]] && command -v pg_config >/dev/null; then PG_BIN="$(pg_config --bindir)"; fi
if [[ -z "$PG_BIN" ]]; then
  for d in /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin /usr/lib/postgresql/*/bin; do
    [[ -x "$d/initdb" ]] && PG_BIN="$d"
  done
fi
if [[ -z "$PG_BIN" || ! -x "$PG_BIN/initdb" || ! -x "$PG_BIN/psql" ]]; then
  echo "CANNOT RUN: no Postgres server binaries found (set PG_BIN)"; exit 2
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/rls-test.XXXXXX")"
PORT=$(( 20000 + RANDOM % 20000 ))
"$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null 2>&1 || { echo "CANNOT RUN: initdb failed"; exit 2; }
"$PG_BIN/pg_ctl" -D "$WORK/data" -l "$WORK/log" -w \
  -o "-c unix_socket_directories='' -c listen_addresses=127.0.0.1 -p $PORT" start >/dev/null 2>&1 \
  || { echo "CANNOT RUN: postgres did not start (see $WORK/log)"; exit 2; }
trap '"$PG_BIN/pg_ctl" -D "$WORK/data" -m fast stop >/dev/null 2>&1' EXIT

q() { "$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d rlstest -X -q -v ON_ERROR_STOP=1 "$@" </dev/null; }
"$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -X -q -c "create database rlstest" </dev/null >/dev/null

pass=0; fail=0
check() {  # name got want
  if [[ "$2" == "$3" ]]; then pass=$((pass+1)); else fail=$((fail+1)); printf 'FAIL %s\n  got:  %s\n  want: %s\n' "$1" "$2" "$3"; fi
}
state() { q -At -F'|' -f "$HERE/rls-state.sql" | awk -F'|' -v k="$1" '$1=="summary" && $2==k {print $3}'; }
as_role() { q -At -c "set role $1; $2" 2>&1 | tail -1; }

q -f "$HERE/fixture-pre-028.sql" >/dev/null || { echo "CANNOT RUN: fixture failed to load"; exit 2; }
PRE="$(q -At -F'|' -f "$HERE/rls-state.sql" | grep '^summary|')"

# ---- BEFORE: the exposure the migrations exist to close must be visible.
# If these fail, the fixture or the check query is wrong, and nothing after
# them means anything.
check "before: policies seen at all"            "$(state policies_in_public)" "18"
check "before: 13 authenticated_all policies"   "$(state authenticated_all_true)" "13"
check "before: 5 anon-reachable policies"       "$(state anon_reachable_policies)" "5"
check "before: view is security definer"        "$(state app_vote_stats_security_invoker)" "false"
check "before: anon can execute rls_auto_enable" "$(state rls_auto_enable_exec_anon)" "true"
check "before: authenticated reads team_members" "$(as_role authenticated 'select count(*) from team_members')" "1"
check "before: authenticated can WRITE tasks"     "$(as_role authenticated "insert into tasks (body) values ('x') returning 1")" "1"
check "before: anon reads fleet_status"          "$(as_role anon 'select count(*) from fleet_status')" "1"

# ---- APPLY the real 028 from the repo, then 029.
q -f "$MIG/028_rls_scope_authenticated_policies.sql" >/dev/null || { echo "FAIL: 028 did not apply"; exit 1; }
if [[ "${SKIP_029:-}" != "1" ]]; then
  q -f "$MIG/029_rls_auto_enable_execute.sql" >/dev/null || { echo "FAIL: 029 did not apply"; exit 1; }
fi

# ---- AFTER 028
check "after 028: no authenticated_all policies" "$(state authenticated_all_true)" "0"
check "after 028: only the two kept vote policies reach anon" "$(state anon_reachable_policies)" "2"
check "after 028: view is security invoker"      "$(state app_vote_stats_security_invoker)" "true"
check "after 028: authenticated sees 0 team_members" "$(as_role authenticated 'select count(*) from team_members')" "0"
check "after 028: authenticated cannot write tasks" \
  "$(as_role authenticated "insert into tasks (body) values ('x')" | grep -c 'row-level security')" "1"
check "after 028: anon sees 0 fleet_status"      "$(as_role anon 'select count(*) from fleet_status')" "0"
check "after 028: service_role still reads team_members" "$(as_role service_role 'select count(*) from team_members')" "1"

# ---- AFTER 029
check "after 029: PUBLIC cannot execute rls_auto_enable"        "$(state rls_auto_enable_exec_public)" "false"
check "after 029: anon cannot execute rls_auto_enable"          "$(state rls_auto_enable_exec_anon)" "false"
check "after 029: authenticated cannot execute rls_auto_enable" "$(state rls_auto_enable_exec_authenticated)" "false"
check "after 029: service_role still can"                       "$(state rls_auto_enable_exec_service_role)" "true"
check "after 029: anon call is refused on privilege" \
  "$(as_role anon 'select public.rls_auto_enable()' | grep -c 'permission denied')" "1"
# Must not over-fire: the event trigger still does its job for a non-owner.
q -c "set role ddl_user; create table public.made_after_029 (id int)" >/dev/null 2>&1
check "after 029: event trigger still enables RLS on a new table" \
  "$(q -At -c "select relrowsecurity from pg_class where relname = 'made_after_029'")" "t"
q -c "drop table public.made_after_029" >/dev/null 2>&1

# ---- ROLLBACK: both commented blocks, uncommented, restore the pre-state summary.
if [[ "${SKIP_029:-}" != "1" ]]; then
  RB="$WORK/rollback.sql"
  sed -n 's/^-- \(create policy .*\)$/\1/p; s/^-- \(alter view .*\)$/\1/p' "$MIG/028_rls_scope_authenticated_policies.sql" > "$RB"
  awk '/^-- ROLLBACK/{r=1} r && /^-- (do|declare|begin|  |end)/{sub(/^-- /,""); print}' "$MIG/029_rls_auto_enable_execute.sql" >> "$RB"
  q -f "$RB" >/dev/null || { echo "FAIL: rollback did not apply"; exit 1; }
  POST="$(q -At -F'|' -f "$HERE/rls-state.sql" | grep '^summary|' | grep -v '_acl|')"
  check "rollback: summary returns to the pre-state (ACL order aside)" "$POST" "$(grep -v '_acl|' <<<"$PRE")"
fi

echo "$([[ $fail -eq 0 ]] && echo "all $pass passed" || echo "$fail FAILED, $pass passed")"
exit $(( fail > 0 ))
