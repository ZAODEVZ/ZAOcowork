import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

interface RepoAskResponse {
  ok: boolean;
  answer?: string;
  needsKey?: boolean;
  note?: string;
  error?: string;
}

async function fetchReadme(org: string, name: string, token?: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${org}/${name}/readme`;
  const headers: HeadersInit = {
    Accept: "application/vnd.github.raw+json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchRecentCommits(org: string, name: string, token?: string): Promise<string> {
  const url = `https://api.github.com/repos/${org}/${name}/commits?per_page=5`;
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return "";
    const commits = await res.json();
    return (commits as { commit: { message?: string } }[])
      .map((c) => `- ${(c.commit.message ?? "").split("\n")[0]}`)
      .join("\n");
  } catch {
    return "";
  }
}

async function callAnthropicAPI(
  context: string,
  question: string,
  repo: string
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = `You are answering a question about the GitHub repo "${repo}". Here is its README and recent commits as context.

README:
${context}

Recent commits:
${await fetchRecentCommits("bettercallzaal", repo, process.env.GITHUB_TOKEN)}

Question: ${question}

Answer concisely and honestly. If the context does not cover the question, say so.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Anthropic API error:", response.status);
      return null;
    }

    const data = await response.json();
    const answer = data.content?.[0]?.text;
    return answer || null;
  } catch (err) {
    console.error("Error calling Anthropic API:", err);
    return null;
  }
}

async function callOpenAIAPI(
  context: string,
  question: string,
  repo: string
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `You are answering a question about the GitHub repo "${repo}". Here is its README and recent commits as context.

README:
${context}

Recent commits:
${await fetchRecentCommits("bettercallzaal", repo, process.env.GITHUB_TOKEN)}

Question: ${question}

Answer concisely and honestly. If the context does not cover the question, say so.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("OpenAI API error:", response.status);
      return null;
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content;
    return answer || null;
  } catch (err) {
    console.error("Error calling OpenAI API:", err);
    return null;
  }
}

export async function POST(req: Request): Promise<NextResponse<RepoAskResponse>> {
  try {
    await requireSession();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { repo, question } = body;

    // Manual validation
    if (!repo || typeof repo !== "string" || repo.length === 0 || repo.length > 100) {
      return NextResponse.json(
        { ok: false, error: "Invalid repo name" },
        { status: 400 }
      );
    }
    if (!question || typeof question !== "string" || question.length === 0 || question.length > 500) {
      return NextResponse.json(
        { ok: false, error: "Invalid question" },
        { status: 400 }
      );
    }

    // Parse org and name from repo (format: "org/name" or just "name")
    let org = "bettercallzaal";
    let name = repo;
    if (repo.includes("/")) {
      const parts = repo.split("/");
      org = parts[0];
      name = parts[1];
    }

    // Fetch README
    const readme = await fetchReadme(org, name, process.env.GITHUB_TOKEN);
    if (!readme) {
      return NextResponse.json({
        ok: false,
        error: `Could not fetch README for ${org}/${name}`,
      });
    }

    // Try Anthropic first, fall back to OpenAI
    let answer = await callAnthropicAPI(readme, question, name);
    if (!answer) {
      answer = await callOpenAIAPI(readme, question, name);
    }

    // If neither worked, return a note
    if (!answer) {
      return NextResponse.json({
        ok: false,
        needsKey: true,
        note: "Set ANTHROPIC_API_KEY (or OPENAI_API_KEY) in the cowork env to enable repo Q&A.",
        error: "No LLM API key configured",
      });
    }

    return NextResponse.json({
      ok: true,
      answer,
    });
  } catch (err) {
    console.error("Error in repo-ask:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to answer question" },
      { status: 500 }
    );
  }
}
