import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MediaDumpRequest {
  content: string;
  url?: string;
  tags?: string[];
}

interface MediaDumpResponse {
  success: boolean;
  error?: string;
  id?: string;
  ai_summary?: string;
  suggested_tags?: string[];
}

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!response.ok) return "";
    const text = await response.text();
    const stripped = text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);
    return stripped;
  } catch {
    return "";
  }
}

async function generateSummaryAndTags(
  content: string,
  url: string | undefined,
  userTags: string[]
): Promise<{ summary: string; tags: string[]; type: string }> {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) {
    return {
      summary: "Could not generate summary (no API key)",
      tags: userTags,
      type: "unknown",
    };
  }

  try {
    const urlContent = url ? await fetchUrlContent(url) : "";
    const prompt = `You are a content analyzer. Given the following content, provide:
1. A short 1-2 sentence summary
2. 3-5 suggested tags (one word each, comma-separated)
3. A single-word type (article|video|podcast|image|idea|reference|code)

Content: ${content}
${urlContent ? `\n\nFetched URL content: ${urlContent}` : ""}

Respond in this exact format:
SUMMARY: [summary here]
TAGS: [tag1, tag2, tag3]
TYPE: [type]`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openrouterKey}`,
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      return {
        summary: "Could not generate summary",
        tags: userTags,
        type: "unknown",
      };
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const result = data.choices?.[0]?.message?.content || "";

    const summaryMatch = result.match(/SUMMARY:\s*(.+?)(?:\n|$)/);
    const tagsMatch = result.match(/TAGS:\s*(.+?)(?:\n|$)/);
    const typeMatch = result.match(/TYPE:\s*(.+?)(?:\n|$)/);

    const summary = summaryMatch ? summaryMatch[1].trim() : "No summary";
    const tags = tagsMatch
      ? tagsMatch[1]
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : userTags;
    const type = typeMatch ? typeMatch[1].trim().toLowerCase() : "unknown";

    return { summary, tags, type };
  } catch {
    return {
      summary: "Error generating summary",
      tags: userTags,
      type: "unknown",
    };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<MediaDumpResponse>> {
  try {
    await requireSession();
  } catch {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as MediaDumpRequest;

    if (!body.content || typeof body.content !== "string") {
      return NextResponse.json(
        { success: false, error: "content is required" },
        { status: 400 }
      );
    }

    const userTags = Array.isArray(body.tags) ? body.tags : [];
    const { summary, tags, type } = await generateSummaryAndTags(
      body.content,
      body.url,
      userTags
    );

    const { data, error } = await serviceClient()
      .from("media_dumps")
      .insert({
        content: body.content,
        url: body.url || null,
        tags,
        type,
        ai_summary: summary,
        processed: true,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: data.id,
      ai_summary: summary,
      suggested_tags: tags,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
