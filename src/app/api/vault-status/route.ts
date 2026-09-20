import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { parseVaultStatus } from "@/lib/vaultStatus";

export const runtime = "nodejs";
// Never cache a stale copy of something meant to read "as of now" -
// re-fetch from GitHub on every request.
export const dynamic = "force-dynamic";

const VAULT_REPO = "bettercallzaal/zao-vault";
const VAULT_PATH = "public-status/status.json";

// Separate, narrowly-scoped token - deliberately NOT the general-purpose
// GITHUB_TOKEN (that one only ever needed public-repo read for the
// Terminals widget). zao-vault is private and carries far more than this
// one file, so this token should be a fine-grained PAT with Contents:
// Read-only scoped to JUST this repo, same pattern as GITHUB_FACTS_TOKEN.
const TOKEN_ENV = "VAULT_STATUS_GITHUB_TOKEN";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env[TOKEN_ENV];
  if (!token) {
    // Graceful degrade, same pattern as every other optional-integration
    // route in this app (repo-activity, repo-ask, etc). The home page
    // renders without this widget until the token is set.
    return NextResponse.json({ ok: true, configured: false, status: null });
  }

  let raw: unknown;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${VAULT_REPO}/contents/${VAULT_PATH}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.raw+json",
        },
      }
    );
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, configured: true, error: `GitHub fetch failed: ${res.status}` },
        { status: 502 }
      );
    }
    const text = await res.text();
    raw = JSON.parse(text);
  } catch (err) {
    return NextResponse.json(
      { ok: false, configured: true, error: "could not fetch or parse status.json" },
      { status: 502 }
    );
  }

  const result = parseVaultStatus(raw);
  if (!result.ok) {
    // Fail-closed: log server-side for whoever's editing status.json to
    // find, but never render a partial/guessed page for a bad payload.
    console.error(`[vault-status] refused payload: ${result.reason}`);
    return NextResponse.json(
      { ok: false, configured: true, error: "status.json failed validation" },
      { status: 502 }
    );
  }

  if (result.droppedKeys.length > 0) {
    // Key NAME only, never the value - see src/lib/vaultStatus.ts header.
    console.warn(`[vault-status] dropped unknown key(s): ${result.droppedKeys.join(", ")}`);
  }

  for (const [field, count] of Object.entries(result.truncatedCounts)) {
    // A writer who published MAX_ITEMS + count entries has no other way to
    // learn that count of them vanished - see src/lib/vaultStatus.ts header.
    console.warn(`[vault-status] truncated "${field}": ${count} item(s) dropped over the cap`);
  }

  return NextResponse.json({ ok: true, configured: true, status: result.status });
}
