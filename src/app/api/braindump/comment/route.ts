import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CommentRequest {
  task_id: string;
  body: string;
}

interface CommentResponse {
  success: boolean;
  error?: string;
  comment_id?: string;
  ai_response_id?: string;
}

async function generateAIResponse(taskId: string, userComment: string): Promise<string> {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) {
    return "Thank you for the feedback. The AI assistant is not currently available.";
  }

  try {
    // Fetch recent comments to provide context
    const { data: comments } = await serviceClient()
      .from("task_comments")
      .select("author, body")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(5);

    const commentHistory = (comments || [])
      .reverse()
      .map((c) => `${c.author === "ai" ? "AI" : "Zaal"}: ${c.body}`)
      .join("\n");

    const prompt = `You are an assistant helping to develop ideas and tasks. The user has provided a comment/feedback on a task. Respond briefly and constructively.

Recent conversation:
${commentHistory}

User's latest comment: ${userComment}

Provide a supportive, actionable response (2-3 sentences max). Focus on next steps or clarification.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openrouterKey}`,
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      return "I encountered an issue generating a response. Please try again.";
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices?.[0]?.message?.content || "Unable to generate a response.";
  } catch {
    return "An error occurred while generating the response.";
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<CommentResponse>> {
  try {
    await requireSession();
  } catch {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as CommentRequest;

    if (!body.task_id || !body.body) {
      return NextResponse.json(
        { success: false, error: "task_id and body are required" },
        { status: 400 }
      );
    }

    // Insert user's comment
    const { data: userCommentData, error: userCommentError } = await serviceClient()
      .from("task_comments")
      .insert({
        task_id: body.task_id,
        author: "zaal",
        body: body.body,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (userCommentError) {
      return NextResponse.json(
        { success: false, error: userCommentError.message },
        { status: 500 }
      );
    }

    // Generate AI response
    const aiResponse = await generateAIResponse(body.task_id, body.body);

    // Insert AI's response
    const { data: aiCommentData, error: aiCommentError } = await serviceClient()
      .from("task_comments")
      .insert({
        task_id: body.task_id,
        author: "ai",
        body: aiResponse,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (aiCommentError) {
      return NextResponse.json(
        { success: false, error: aiCommentError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      comment_id: userCommentData?.id,
      ai_response_id: aiCommentData?.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
