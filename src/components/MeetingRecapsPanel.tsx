"use client";

import { useState, useMemo } from "react";
import type { MeetingRecap } from "@/lib/meeting-recaps";

export function MeetingRecapsPanel({ recaps }: { recaps: MeetingRecap[] }) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return recaps.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()));
  }, [recaps, search]);

  function toggleExpanded(id: string) {
    setExpandedId(expandedId === id ? null : id);
  }

  return (
    <div className="space-y-4">
      {/* Search box */}
      <input
        type="text"
        placeholder="Search recaps by title..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition"
      />

      {/* Result count */}
      <div className="text-sm text-white/50">
        {filtered.length} of {recaps.length} recaps
      </div>

      {/* Recaps list */}
      <div className="space-y-3">
        {filtered.map((recap) => (
          <div
            key={recap.id}
            className="rounded-lg border border-white/10 bg-white/5 overflow-hidden"
          >
            <button
              onClick={() => toggleExpanded(recap.id)}
              className="w-full px-4 py-3 hover:bg-white/[0.08] transition text-left flex items-start justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white/90 line-clamp-2">{recap.title}</h3>
                {recap.meetingDate && (
                  <p className="text-xs text-white/50 mt-1">
                    {new Date(recap.meetingDate).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                )}
              </div>
              <span className="text-white/40 flex-shrink-0 mt-0.5">
                {expandedId === recap.id ? "−" : "+"}
              </span>
            </button>

            {/* Expanded body */}
            {expandedId === recap.id && recap.body && (
              <div className="px-4 py-3 border-t border-white/10 bg-black/20">
                <div className="text-sm text-white/70 whitespace-pre-wrap break-words">
                  {recap.body}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8">
          <p className="text-white/50">No recaps match your search.</p>
        </div>
      )}
    </div>
  );
}
