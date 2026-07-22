import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IdeasDumpRequest {
  content: string;
}

interface IdeasDumpResponse {
  success: boolean;
  error?: string;
  tasks_created?: number;
  task_ids?: string[];
}

interface ParsedTask {
  title: string;
  description?: string;
}

async function parseIdeasWithAI(content: string): Promise<ParsedTask[]> {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) {
    return [];
  }

  try {
    const prompt = `You are a task extraction system. Given a braindump of ideas and todos, extract DISTINCT structured tasks.

For each task, provide:
1. A clear, actionable title (max 12 words)
2. A brief description if helpful

Return ONLY valid JSON (no markdown, no backticks). Format:
[
  { "title": "Task title here", "description": "Optional details" },
  { "title": "Another task", "description": "Details" }
]

Braindump content:
${content}

Return the JSON array ONLY, no other text.`;

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
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const result = data.choices?.[0]?.message?.content || "";

    try {
      const parsed = JSON.parse(result);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  } catch {
    return [];
  }
}

async function generateTaskAnalysis(task: ParsedTask): Promise<string> {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) {
    return "Task created from braindump capture.";
  }

  try {
    const prompt = `Generate a brief, actionable analysis for this task. Suggest next steps or context that would help someone execute it.

Task title: ${task.title}
Description: ${task.description || "None provided"}

Keep your response to 2-3 sentences, practical and direct.`;

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
      return "Analysis could not be generated.";
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices?.[0]?.message?.content || "No analysis generated.";
  } catch {
    return "Error generating analysis.";
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<IdeasDumpResponse>> {
  try {
    await requireSession();
  } catch {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as IdeasDumpRequest;

    if (!body.content || typeof body.content !== "string") {
      return NextResponse.json(
        { success: false, error: "content is required" },
        { status: 400 }
      );
    }

    const tasks = await parseIdeasWithAI(body.content);

    if (tasks.length === 0) {
      return NextResponse.json({
        success: true,
        tasks_created: 0,
        task_ids: [],
      });
    }

    const createdTaskIds: string[] = [];
    const timestamp = new Date().toISOString().replace(/[^\w]/g, "");

    for (const task of tasks) {
      try {
        // Insert the task into the tasks table
        const { data: taskData, error: taskError } = await serviceClient()
          .from("tasks")
          .insert({
            title: task.title,
            status: "todo",
            project: "zaodevz",
            kind: "task",
            legacy_source: `braindump:${timestamp}`,
            notes: task.description || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id, legacy_id")
          .single();

        if (taskError) {
          continue;
        }

        const taskId = taskData?.id;
        if (taskId) {
          createdTaskIds.push(taskId);

          // Generate AI analysis
          const analysis = await generateTaskAnalysis(task);

          // Insert as first comment from AI
          await serviceClient()
            .from("task_comments")
            .insert({
              task_id: taskId,
              author: "ai",
              body: analysis,
              created_at: new Date().toISOString(),
            });
        }
      } catch {
        // Continue with next task on error
        continue;
      }
    }

    return NextResponse.json({
      success: true,
      tasks_created: createdTaskIds.length,
      task_ids: createdTaskIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
