"use client";

import { useState } from "react";
import Link from "next/link";
import type { ActionItem } from "@/lib/data";

function formatEventDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEventTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function groupEventsByDate(events: ActionItem[]): Map<string, ActionItem[]> {
  const grouped = new Map<string, ActionItem[]>();
  for (const event of events) {
    if (!event.eventAt) continue;
    const dateKey = event.eventAt.slice(0, 10); // YYYY-MM-DD
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey)!.push(event);
  }
  // Sort each group by time
  for (const group of grouped.values()) {
    group.sort((a, b) => {
      const aTime = new Date(a.eventAt || "").getTime();
      const bTime = new Date(b.eventAt || "").getTime();
      return aTime - bTime;
    });
  }
  return grouped;
}

export function EventsAgenda({ events }: { events: ActionItem[] }) {
  const [showPast, setShowPast] = useState(false);

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-white/50">
        <p>No upcoming events scheduled.</p>
      </div>
    );
  }

  const now = new Date();
  const upcomingEvents = events.filter((e) => new Date(e.eventAt || "") >= now);
  const pastEvents = events.filter((e) => new Date(e.eventAt || "") < now);

  const upcomingGroups = groupEventsByDate(upcomingEvents);
  const pastGroups = showPast ? groupEventsByDate(pastEvents) : new Map();

  // Convert map to sorted array of [dateKey, events[]]
  const sortedUpcoming = Array.from(upcomingGroups.entries()).sort();
  const sortedPast = Array.from(pastGroups.entries()).sort().reverse();

  return (
    <div className="space-y-4">
      {/* Upcoming Events */}
      {sortedUpcoming.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-semibold text-blue-400">Upcoming</span>
            <span className="text-xs text-white/40">{upcomingEvents.length} events</span>
          </div>
          {sortedUpcoming.map(([dateKey, dayEvents]) => (
            <div key={dateKey} className="space-y-2">
              <div className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                {new Date(dateKey).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="space-y-2 pl-0">
                {dayEvents.map((event) => (
                  <Link
                    key={event.id}
                    href={`/todo/${event.id}`}
                    className="block p-3 rounded-lg bg-white/5 hover:bg-white/10 transition border border-white/10 hover:border-blue-500/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white truncate">{event.title}</div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-white/60">
                          <span>{formatEventTime(event.eventAt || "")}</span>
                          {event.eventLocation && (
                            <>
                              <span className="text-white/30">•</span>
                              <span className="truncate">{event.eventLocation}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {event.eventUrl && (
                        <a
                          href={event.eventUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 text-xs flex-shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Link
                        </a>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-white/40 text-sm">
          No upcoming events. Check back soon!
        </div>
      )}

      {/* Past Events Toggle */}
      {pastEvents.length > 0 && (
        <div className="pt-4 border-t border-white/10">
          <button
            onClick={() => setShowPast(!showPast)}
            className="text-xs text-white/50 hover:text-white/70 transition"
          >
            {showPast ? "Hide" : "Show"} {pastEvents.length} past events
          </button>
          {showPast && (
            <div className="mt-4 space-y-3 opacity-60">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm font-semibold text-white/40">Past</span>
              </div>
              {sortedPast.map(([dateKey, dayEvents]) => (
                <div key={dateKey} className="space-y-2">
                  <div className="text-xs font-semibold text-white/30 uppercase tracking-wider">
                    {new Date(dateKey).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                  <div className="space-y-1 pl-0">
                    {dayEvents.map((event: ActionItem) => (
                      <Link
                        key={event.id}
                        href={`/todo/${event.id}`}
                        className="block p-2 rounded text-xs text-white/30 hover:text-white/50 transition"
                      >
                        {formatEventTime(event.eventAt || "")} - {event.title}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
