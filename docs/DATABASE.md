# Database: versioning, backups & restore

The cowork app runs on one Supabase Postgres project (`etwvzrmlxeobinrlytza`).
All app access is via `SUPABASE_SERVICE_KEY` (bypasses RLS); the app has its own
cookie auth, not Supabase Auth. Three layers protect the data:

## 1. Schema version control (git)

`supabase/migrations/*.sql` is the schema history. Apply order:

| # | File | Notes |
|---|------|-------|
| 001–006 | roles/passwords, brands, audit_logs, service_class/archive/triage, proposals, projects/source | applied |
| 007–009 | metadata/columns, deps, public layer | applied |
| 010 | `bot_heartbeats` | applied |
| 011 | `enable_rls` | **apply this** — locks the anon key out (see below) |

> ⚠️ Migrations are applied **manually** in the Supabase SQL editor today (the
> read-only MCP can't run DDL). To remove drift, adopt the Supabase CLI:
> `supabase link --project-ref etwvzrmlxeobinrlytza` then `supabase db push`.

**Always** add schema changes as a new numbered migration file in git — never
ad-hoc in the dashboard — so the repo stays the source of truth.

## 2. Managed backups / PITR (Supabase dashboard)

Dashboard → Database → **Backups**:
- Daily automated backups (restore a full snapshot).
- **Point-in-time recovery (PITR)** — Pro add-on; restore to any second in the
  window. Recommended now that the board is business-critical. This is the
  "undo a disaster" button.

## 3. Owned nightly dumps (this repo)

`.github/workflows/db-backup.yml` runs `pg_dump` nightly and commits a gzipped
dump to the **`db-backups` branch** (`backups/cowork-YYYY-MM-DD.sql.gz`, ~30
days retained). Independent of Supabase, so we always hold our own copies.

> ⚠️ **Install the workflow:** the file is provided as
> `docs/db-backup.workflow.yml` (the automation token can't write under
> `.github/workflows/`). Copy it to **`.github/workflows/db-backup.yml`** via the
> GitHub web UI (Add file → Create new file) — your account has the `workflow`
> scope — or `git mv docs/db-backup.workflow.yml .github/workflows/db-backup.yml`
> locally and push.

**Setup (one-time):** add repo secret **`SUPABASE_DB_URL`** = the Postgres
connection URI from Supabase → Settings → Database → Connection string (URI,
includes the password). Until it's set, the job no-ops. Trigger a first run from
Actions → db-backup → "Run workflow".

### Restore from an owned dump

```bash
# get a dump off the db-backups branch
git fetch origin db-backups
git show origin/db-backups:backups/cowork-2026-06-07.sql.gz > dump.sql.gz

# restore into a target DB (test/staging first!)
gunzip -c dump.sql.gz | psql "$SUPABASE_DB_URL"
```

For a full disaster (prod), prefer Supabase PITR/snapshot restore from the
dashboard; use these dumps for table-level recovery or moving data elsewhere.

## Quick "is the DB locked down?" check

```sql
select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;
-- every table should be rowsecurity = true after migration 011
```
