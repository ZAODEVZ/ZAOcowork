#!/usr/bin/env python3
"""Migrate ZAOcoworking actions.json -> the unified `tasks` table.

Reads a cowork-zaodevz data/actions.json and emits idempotent SQL (doc 692
field mapping). Re-running replaces every cowork-sourced row. Emits a compact
CTE + multi-row VALUES form: one insert for tasks, one for activity_log,
owner FKs resolved by join on team_members.legacy_owner.

Usage:  python3 migrate-cowork-actions.py [actions.json] > migrate.sql
Default input: /tmp/live-actions.json
"""
import json
import re
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/live-actions.json"
items = json.load(open(SRC))["items"]

STATUS = {"TODO": "todo", "WIP": "in_progress", "BLOCKED": "blocked", "DONE": "done"}
PEOPLE = {"zaal": "Zaal", "iman": "Iman", "thyrev": "ThyRev",
          "thy revolution": "ThyRev", "samantha": "Samantha", "candytoybox": "Samantha"}
VALID_PRIORITY = {"P1", "P2", "P3"}
VALID_PHASE = {"Define", "Measure", "Analyze", "Improve", "Control"}


def lit(v):
    """SQL literal: quoted string or null."""
    if v is None or v == "":
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def boollit(v):
    return "true" if v else "false"


def date_or_none(v):
    return v if v and re.match(r"^\d{4}-\d{2}-\d{2}$", str(v)) else None


def ts_or_none(v):
    return v if v and "T" in str(v) else None


def owner_lo(name):
    """legacy_owner string for a person, or None."""
    if not name:
        return None
    return PEOPLE.get(str(name).strip().lower())


task_rows = []
act_rows = []

for it in items:
    cat = (it.get("category") or "").strip()
    project = "wavewarz" if "wavewarz" in cat.lower() else "zaodevz"
    status = STATUS.get(it.get("status", "TODO"), "todo")
    owner = it.get("owner")
    o_lo = owner_lo(owner) if owner in ("Zaal", "Iman", "ThyRev", "Samantha") else None
    notes = it.get("notes") or ""
    due_raw = (it.get("due") or "").strip()
    due = date_or_none(due_raw)
    if due_raw and not due:
        notes = notes + ("\n" if notes else "") + f"(due: {due_raw})"
    priority = it.get("priority") if it.get("priority") in VALID_PRIORITY else None
    phase = it.get("phase") if it.get("phase") in VALID_PHASE else None
    task_rows.append("  (" + ",".join([
        lit(it.get("id")), lit(project), lit(it.get("title")), lit(status),
        lit(o_lo), lit(owner_lo(it.get("createdBy"))), lit(owner_lo(it.get("completedBy"))),
        lit(cat), lit(priority), lit(phase),
        boollit(it.get("important")), boollit(it.get("urgent")),
        lit(due), lit(notes), lit(ts_or_none(it.get("completedAt"))),
        lit(ts_or_none(it.get("createdAt"))), lit(ts_or_none(it.get("updatedAt"))),
    ]) + ")")
    for c in it.get("comments", []) or []:
        act_rows.append("  (" + ",".join([
            lit(it.get("id")), lit(project), lit(owner_lo(c.get("userId"))),
            "'comment'", lit(c.get("content")), lit(ts_or_none(c.get("createdAt"))),
        ]) + ")")
    for a in it.get("activity", []) or []:
        act_rows.append("  (" + ",".join([
            lit(it.get("id")), lit(project), lit(owner_lo(a.get("userId"))),
            lit(a.get("action")), lit(a.get("detail")), lit(ts_or_none(a.get("createdAt"))),
        ]) + ")")

print("-- ZAO unified DB: migrate cowork-zaodevz actions.json -> tasks + activity_log")
print("-- Idempotent: re-running replaces all cowork-sourced rows.\n")
print("insert into team_members (name, legacy_owner)")
print("select v.name, v.lo from (values "
      "('Zaal','Zaal'),('Iman','Iman'),('ThyRev','ThyRev'),('Samantha','Samantha')) v(name,lo)")
print("where not exists (select 1 from team_members t where t.legacy_owner = v.lo);\n")
print("delete from tasks where legacy_source = 'cowork-actions.json';\n")

print("insert into tasks (legacy_source, kind, legacy_id, project, title, status, "
      "owner_id, created_by, completed_by, category, priority, phase, important, urgent, "
      "due, notes, completed_at, created_at, updated_at)")
print("select 'cowork-actions.json', 'task', s.lid, s.project, s.title, s.status, "
      "o.id, cb.id, cmp.id, s.category, s.priority, s.phase, s.important, s.urgent, "
      "s.due::date, s.notes, s.completed_at::timestamptz, s.created_at::timestamptz, "
      "s.updated_at::timestamptz")
print("from (values")
print(",\n".join(task_rows))
print(") s(lid, project, title, status, owner_lo, createdby_lo, completedby_lo, category, "
      "priority, phase, important, urgent, due, notes, completed_at, created_at, updated_at)")
print("left join team_members o   on o.legacy_owner   = s.owner_lo")
print("left join team_members cb  on cb.legacy_owner  = s.createdby_lo")
print("left join team_members cmp on cmp.legacy_owner = s.completedby_lo;\n")

if act_rows:
    print("insert into activity_log (project, task_id, actor_id, action, detail, created_at)")
    print("select s.project, t.id, a.id, s.action, s.detail, s.created_at::timestamptz")
    print("from (values")
    print(",\n".join(act_rows))
    print(") s(legacy_id, project, actor_lo, action, detail, created_at)")
    print("join tasks t on t.legacy_id = s.legacy_id and t.legacy_source = 'cowork-actions.json'")
    print("left join team_members a on a.legacy_owner = s.actor_lo;")

print(f"-- {len(items)} tasks, {len(act_rows)} activity rows", file=sys.stderr)
