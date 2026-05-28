// Migration filenames as a single source of truth (doc 766 finding #10).
//
// Every "migration not ready" banner across /admin / /admin/* surfaces
// pulls from here so renames need touching only one file. Listed in
// the order they should be applied for a fresh deploy.

export const MIGRATIONS = {
  team_member_roles: "001_team_member_roles_and_passwords.sql",
  brands_table: "002_brands_table.sql",
  audit_logs: "003_audit_logs.sql",
  service_class_archive_triage: "004_service_class_archive_triage.sql",
  proposals: "005_proposals_and_misc.sql",
  projects_and_source: "006_projects_and_source.sql",
} as const;

export type MigrationKey = keyof typeof MIGRATIONS;

export function migrationPath(key: MigrationKey): string {
  return `supabase/migrations/${MIGRATIONS[key]}`;
}
