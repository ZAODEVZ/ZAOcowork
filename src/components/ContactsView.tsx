"use client";

import { useState, useMemo } from "react";
import type { Contact } from "@/lib/contacts";

type CategoryFilter = "All" | "Music" | "Tech" | "Other";

const CATEGORIES: CategoryFilter[] = ["All", "Music", "Tech", "Other"];

function matchesSearch(c: Contact, q: string): boolean {
  const query = q.toLowerCase();
  return (
    c.name.toLowerCase().includes(query) ||
    (c.superheroName?.toLowerCase().includes(query) ?? false) ||
    (c.company?.toLowerCase().includes(query) ?? false) ||
    (c.bio?.toLowerCase().includes(query) ?? false) ||
    (c.howHelpZao?.toLowerCase().includes(query) ?? false)
  );
}

export function ContactsView({ contacts }: { contacts: Contact[] }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (!matchesSearch(c, search)) return false;
      if (categoryFilter !== "All" && c.category !== categoryFilter) return false;
      if (priorityFilter !== "all" && c.priority !== priorityFilter) return false;
      return true;
    });
  }, [contacts, search, categoryFilter, priorityFilter]);

  return (
    <div className="space-y-6">
      {/* Search box */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search contacts by name, superhero, company, or bio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition"
        />
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              categoryFilter === cat
                ? "bg-blue-500/30 text-blue-200 border border-blue-400/50"
                : "bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Priority filter chips */}
      <div className="flex flex-wrap gap-2">
        {["all", "high", "medium", "low"].map((p) => (
          <button
            key={p}
            onClick={() => setPriorityFilter(p as "all" | "high" | "medium" | "low")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${
              priorityFilter === p
                ? "bg-amber-500/30 text-amber-200 border border-amber-400/50"
                : "bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10"
            }`}
          >
            {p === "all" ? "All Priorities" : `${p.charAt(0).toUpperCase() + p.slice(1)} Priority`}
          </button>
        ))}
      </div>

      {/* Result count */}
      <div className="text-sm text-white/50">
        {filtered.length} of {contacts.length} contacts
      </div>

      {/* Contacts grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <div
            key={c.id}
            className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3 hover:bg-white/[0.08] transition"
          >
            {/* Name */}
            <div>
              <h3 className="text-base font-semibold text-[#f5a623]">{c.name}</h3>
              {c.superheroName && (
                <p className="text-xs text-white/60">{c.superheroName}</p>
              )}
              {c.company && (
                <p className="text-xs text-white/60">{c.company}</p>
              )}
            </div>

            {/* Category + Priority chips */}
            <div className="flex flex-wrap gap-2">
              {c.category && (
                <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-200 border border-blue-400/30">
                  {c.category}
                </span>
              )}
              {c.priority && (
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium border ${
                    c.priority === "high"
                      ? "bg-red-500/20 text-red-200 border-red-400/30"
                      : c.priority === "medium"
                        ? "bg-amber-500/20 text-amber-200 border-amber-400/30"
                        : "bg-green-500/20 text-green-200 border-green-400/30"
                  }`}
                >
                  {c.priority}
                </span>
              )}
            </div>

            {/* Where met */}
            {c.whereMet && (
              <div>
                <p className="text-xs text-white/40 font-medium">Where met</p>
                <p className="text-sm text-white/70">{c.whereMet}</p>
              </div>
            )}

            {/* Bio */}
            {c.bio && (
              <div>
                <p className="text-xs text-white/40 font-medium">Bio</p>
                <p className="text-sm text-white/70 line-clamp-3">{c.bio}</p>
              </div>
            )}

            {/* How can help ZAO */}
            {c.howHelpZao && (
              <div>
                <p className="text-xs text-white/40 font-medium">Can help ZAO</p>
                <p className="text-sm text-white/70 line-clamp-3">{c.howHelpZao}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-white/50">No contacts match your search.</p>
        </div>
      )}
    </div>
  );
}
