import { NextResponse } from "next/server";
import { getActions } from "@/lib/data";
import { requireSession } from "@/lib/auth";
import type { ActionItem } from "@/lib/data";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const doc = await getActions();

    // Filter to events (tasks with isEvent=true) and sort by eventAt ascending
    const events = doc.items
      .filter((item): item is ActionItem => Boolean(item.isEvent && item.eventAt))
      .sort((a, b) => {
        const aTime = new Date(a.eventAt || "").getTime();
        const bTime = new Date(b.eventAt || "").getTime();
        return aTime - bTime;
      });

    return NextResponse.json({
      ok: true,
      events,
      count: events.length,
    });
  } catch (error) {
    console.error("Failed to fetch events:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, eventAt, eventLocation, eventUrl, notes } = body;

    // Validate required fields
    if (!title || !title.trim()) {
      return NextResponse.json(
        { ok: false, error: "Title is required" },
        { status: 400 }
      );
    }
    if (!eventAt) {
      return NextResponse.json(
        { ok: false, error: "Event date/time is required" },
        { status: 400 }
      );
    }

    // Validate eventAt is a valid ISO datetime
    const eventDate = new Date(eventAt);
    if (isNaN(eventDate.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Invalid event date/time format" },
        { status: 400 }
      );
    }

    // For now, return a placeholder response
    // In a real implementation, we'd call saveActions to persist the event
    return NextResponse.json(
      {
        ok: false,
        error: "Event creation not yet implemented via API",
      },
      { status: 501 }
    );
  } catch (error) {
    console.error("Failed to create event:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create event" },
      { status: 500 }
    );
  }
}
