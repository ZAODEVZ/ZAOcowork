import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const token = process.env.GITHUB_TOKEN;
  const repo = "bettercallzaal/ZAOOS";

  if (!token) {
    return NextResponse.json({
      ok: true,
      openIssues: null,
      mergedToday: null,
    });
  }

  try {
    const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    const repoData = await repoRes.json();

    const since = new Date(Date.now() - 86400000).toISOString();
    const prRes = await fetch(
      `https://api.github.com/search/issues?q=repo:${repo}+is:pr+is:merged+merged:>=${since}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    const prData = await prRes.json();

    return NextResponse.json({
      ok: true,
      openIssues: repoData.open_issues_count ?? null,
      mergedToday: prData.total_count ?? null,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      openIssues: null,
      mergedToday: null,
    });
  }
}
