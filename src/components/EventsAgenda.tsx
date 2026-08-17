"use client";

import { useState } from "react";
import Link from "next/link";
import type { ActionItem } from "@/lib/data";

// "2026-08-16" parsed by `new Date()` is UTC midnight, which renders as the
// previous day for anyone west of Greenwich. Parse the parts as local instead.
function dateKeyToLocal(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDayHeading(dateKey: string): string {
  return dateKeyToLocal(dateKey).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
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
      <div className="text-center py-12 text-ink-tertiary">
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
            <span className="text-sm font-semibold text-accent">Upcoming</span>
            <span className="text-xs text-ink-tertiary">
              {upcomingEvents.length} event{upcomingEvents.length === 1 ? "" : "s"}
            </span>
          </div>
          {sortedUpcoming.map(([dateKey, dayEvents]) => (
            <div key={dateKey} className="space-y-2">
              <div className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">
                {formatDayHeading(dateKey)}
              </div>
              <div className="space-y-2 pl-0">
                {dayEvents.map((event) => (
                  <Link
                    key={event.id}
                    href={`/todo/${event.id}`}
                    className="block p-3 rounded-lg bg-surface hover:bg-surface-hover transition border border-border hover:border-accent/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-ink-primary truncate">{event.title}</div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-ink-secondary">
                          <span>{formatEventTime(event.eventAt || "")}</span>
                          {event.eventLocation && (
                            <>
                              <span className="text-ink-tertiary">•</span>
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
                          className="text-accent hover:text-accent-light text-xs flex-shrink-0"
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
        <div className="text-center py-8 text-ink-tertiary text-sm">
          No upcoming events. Check back soon.
        </div>
      )}

      {/* Past Events Toggle */}
      {pastEvents.length > 0 && (
        <div className="pt-4 border-t border-border">
          <button
            onClick={() => setShowPast(!showPast)}
            aria-expanded={showPast}
            className="text-xs text-ink-secondary hover:text-ink-primary transition"
          >
            {showPast ? "Hide" : "Show"} {pastEvents.length} past event
            {pastEvents.length === 1 ? "" : "s"}
          </button>
          {showPast && (
            <div className="mt-4 space-y-3 opacity-75">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm font-semibold text-ink-tertiary">Past</span>
              </div>
              {sortedPast.map(([dateKey, dayEvents]) => (
                <div key={dateKey} className="space-y-2">
                  <div className="text-xs font-semibold text-ink-tertiary uppercase tracking-wider">
                    {formatDayHeading(dateKey)}
                  </div>
                  <div className="space-y-1 pl-0">
                    {dayEvents.map((event: ActionItem) => (
                      <Link
                        key={event.id}
                        href={`/todo/${event.id}`}
                        className="block p-2 rounded text-xs text-ink-tertiary hover:text-ink-primary transition"
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
