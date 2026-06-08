# Database migrations — Supabase CLI flow

Goal: stop hand-pasting SQL in the dashboard (which drifts from git). The repo's
`supabase/migrations/*.sql` becomes the single source of truth, applied with
`supabase db push`.

Project ref: `etwvzrmlxeobinrlytza`.

## One-time setup (do this on the Mac)

```bash
# 1. Install the CLI
brew install supabase/tap/supabase        # or: npx supabase --version

# 2. Init (creates supabase/config.toml if not present) + link the project
supabase init                              # safe if already initialized
supabase login                             # opens browser for your access token
supabase link --project-ref etwvzrmlxeobinrlytza   # will ask for the DB password

# 3. BASELINE the already-applied migrations so push doesn't re-run them.
#    Migrations 001-012 were applied by hand in the dashboard, so the CLI's
#    tracking table doesn't know about them yet. Mark each as applied:
supabase migration list                    # shows local vs remote; note which are already live
supabase migration repair --status applied 001 002 003 004 005 006 007 008 009 010 011 012
#    (adjust the list to exactly what `migration list` shows as already-applied)
```

## Day-to-day

```bash
npm run db:list     # see local vs remote migration state
npm run db:new add_widget_table   # create supabase/migrations/<timestamp>_add_widget_table.sql
# ...edit the new file...
npm run db:push     # apply pending migrations to the linked project
```

- **Always** create schema changes as a new migration file (never ad-hoc in the
  dashboard) so git stays authoritative.
- `npm run db:diff` generates a migration from changes made in the dashboard, if
  you ever need to capture drift back into git.

## Outstanding to apply

After baselining, push the migration that isn't live yet:
- **`013_enable_rls.sql`** — enables RLS on all tables (the anon-key fix, PR #67).
  `supabase db push` will apply it; verify with:
  ```sql
  select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;
  ```
- **`014_renumber_legacy_ids.sql`** — gives every task a clean numeric id by
  renumbering rows whose `legacy_id` is non-numeric (meeting captures, UUID
  fallbacks). Data-only (DML). Verify with:
  ```sql
  select count(*) from tasks where legacy_id is null or legacy_id !~ '^[0-9]+$'; -- expect 0
  ```
  Note: old slug links (e.g. `?task=meeting-…`) stop resolving once applied.

## Optional: auto-apply on merge (CI)

`docs/db-push.workflow.yml` runs `supabase db push` whenever a migration lands on
`main`. Copy it to `.github/workflows/db-push.yml` via the GitHub web UI (the
automation token can't write under `.github/workflows/`). Add repo secrets:
- `SUPABASE_ACCESS_TOKEN` (from supabase.com account → Access Tokens)
- `SUPABASE_DB_PASSWORD` (the database password)

Until those are set the job no-ops.
