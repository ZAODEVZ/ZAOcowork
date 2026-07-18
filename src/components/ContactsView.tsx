"use client";

import { useState, useMemo, useCallback } from "react";
import type { Contact } from "@/lib/contacts";

type CategoryFilter = "All" | "Music" | "Tech" | "Other";
type ViewMode = "table" | "cards";
type SortField = "name" | "company" | "category" | "priority" | "whereMet" | "origin";
type SortOrder = "asc" | "desc";

const CATEGORIES: CategoryFilter[] = ["All", "Music", "Tech", "Other"];
const ITEMS_PER_PAGE = 50;
const TABLE_COLUMNS: Array<{ key: SortField; label: string }> = [
  { key: "name", label: "Name" },
  { key: "company", label: "Company" },
  { key: "category", label: "Category" },
  { key: "priority", label: "Priority" },
  { key: "whereMet", label: "Where Met" },
  { key: "origin", label: "Origin" },
];

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

interface DetailDrawerProps {
  contact: Contact;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Contact>) => Promise<void>;
}

function DetailDrawer({ contact, onClose, onUpdate }: DetailDrawerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(contact);
  const [isSaving, setIsSaving] = useState(false);
  const [logChannel, setLogChannel] = useState("email");
  const [logSummary, setLogSummary] = useState("");
  const [isLoggingInteraction, setIsLoggingInteraction] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const changes: Record<string, unknown> = {};
      const fields: (keyof Contact)[] = [
        "name",
        "superheroName",
        "company",
        "whereMet",
        "origin",
        "bio",
        "howHelpZao",
        "priority",
        "category",
      ];
      for (const field of fields) {
        if (editData[field] !== contact[field]) {
          changes[field] = editData[field];
        }
      }
      if (Object.keys(changes).length > 0) {
        await onUpdate(contact.id, changes);
        setIsEditing(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogInteraction = async () => {
    if (!logSummary.trim()) return;
    setIsLoggingInteraction(true);
    try {
      const res = await fetch(`/api/crm/contacts/${contact.id}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: logChannel, summary: logSummary }),
      });
      if (res.ok) {
        setLogSummary("");
        setLogChannel("email");
      }
    } finally {
      setIsLoggingInteraction(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="w-full sm:max-w-2xl max-h-screen sm:max-h-screen overflow-y-auto bg-zao-navy rounded-t-lg sm:rounded-lg border border-white/10 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zao-gold">{contact.name}</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-2xl font-light"
          >
            ×
          </button>
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Name</label>
              <input
                type="text"
                value={editData.name}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Company</label>
              <input
                type="text"
                value={editData.company || ""}
                onChange={(e) => setEditData({ ...editData, company: e.target.value || null })}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Superhero Name</label>
              <input
                type="text"
                value={editData.superheroName || ""}
                onChange={(e) =>
                  setEditData({ ...editData, superheroName: e.target.value || null })
                }
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Category</label>
                <select
                  value={editData.category || ""}
                  onChange={(e) => setEditData({ ...editData, category: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                >
                  <option value="">None</option>
                  <option value="Music">Music</option>
                  <option value="Tech">Tech</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Priority</label>
                <select
                  value={editData.priority || ""}
                  onChange={(e) => setEditData({ ...editData, priority: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                >
                  <option value="">None</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Bio</label>
              <textarea
                value={editData.bio || ""}
                onChange={(e) => setEditData({ ...editData, bio: e.target.value || null })}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">How Can Help ZAO</label>
              <textarea
                value={editData.howHelpZao || ""}
                onChange={(e) =>
                  setEditData({ ...editData, howHelpZao: e.target.value || null })
                }
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-500/30 text-blue-200 border border-blue-400/50 hover:bg-blue-500/40 disabled:opacity-50 transition"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditData(contact);
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {contact.superheroName && (
                <div>
                  <p className="text-xs text-white/50 font-medium">Superhero Name</p>
                  <p className="text-sm text-white/80">{contact.superheroName}</p>
                </div>
              )}
              {contact.company && (
                <div>
                  <p className="text-xs text-white/50 font-medium">Company</p>
                  <p className="text-sm text-white/80">{contact.company}</p>
                </div>
              )}
              {contact.category && (
                <div>
                  <p className="text-xs text-white/50 font-medium">Category</p>
                  <p className="text-sm text-white/80">{contact.category}</p>
                </div>
              )}
              {contact.priority && (
                <div>
                  <p className="text-xs text-white/50 font-medium">Priority</p>
                  <p className="text-sm text-white/80">{contact.priority}</p>
                </div>
              )}
              {contact.whereMet && (
                <div>
                  <p className="text-xs text-white/50 font-medium">Where Met</p>
                  <p className="text-sm text-white/80">{contact.whereMet}</p>
                </div>
              )}
              {contact.origin && (
                <div>
                  <p className="text-xs text-white/50 font-medium">Origin</p>
                  <p className="text-sm text-white/80">{contact.origin}</p>
                </div>
              )}
            </div>

            {contact.bio && (
              <div>
                <p className="text-xs text-white/50 font-medium">Bio</p>
                <p className="text-sm text-white/70">{contact.bio}</p>
              </div>
            )}

            {contact.howHelpZao && (
              <div>
                <p className="text-xs text-white/50 font-medium">How Can Help ZAO</p>
                <p className="text-sm text-white/70">{contact.howHelpZao}</p>
              </div>
            )}

            <div className="border-t border-white/10 pt-4">
              <h3 className="font-semibold text-white/80 mb-3">Log Interaction</h3>
              <div className="space-y-2">
                <select
                  value={logChannel}
                  onChange={(e) => setLogChannel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                >
                  <option value="email">Email</option>
                  <option value="call">Call</option>
                  <option value="farcaster">Farcaster</option>
                  <option value="telegram">Telegram</option>
                  <option value="in-person">In Person</option>
                  <option value="other">Other</option>
                </select>
                <textarea
                  value={logSummary}
                  onChange={(e) => setLogSummary(e.target.value)}
                  placeholder="Summary of interaction..."
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                  rows={3}
                />
                <button
                  onClick={handleLogInteraction}
                  disabled={!logSummary.trim() || isLoggingInteraction}
                  className="w-full px-4 py-2 rounded-lg bg-amber-500/30 text-amber-200 border border-amber-400/50 hover:bg-amber-500/40 disabled:opacity-50 transition"
                >
                  {isLoggingInteraction ? "Logging..." : "Log Interaction"}
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-500/30 text-blue-200 border border-blue-400/50 hover:bg-blue-500/40 transition"
              >
                Edit
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-lg bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ContactsView({ contacts }: { contacts: Contact[] }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [whereMetFilter, setWhereMetFilter] = useState<string>("");
  const [haseBio, setHasBio] = useState(false);
  const [hasHowHelp, setHasHowHelp] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [visibleColumns, setVisibleColumns] = useState<Set<SortField>>(
    new Set(["name", "company", "category", "priority"])
  );
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const whereMetOptions = useMemo(() => {
    const opts = new Set<string>();
    contacts.forEach((c) => {
      if (c.whereMet) opts.add(c.whereMet);
    });
    return Array.from(opts).sort();
  }, [contacts]);

  const filtered = useMemo(() => {
    let result = contacts.filter((c) => {
      if (!matchesSearch(c, search)) return false;
      if (categoryFilter !== "All" && c.category !== categoryFilter) return false;
      if (priorityFilter !== "all" && c.priority !== priorityFilter) return false;
      if (whereMetFilter && c.whereMet !== whereMetFilter) return false;
      if (haseBio && !c.bio) return false;
      if (hasHowHelp && !c.howHelpZao) return false;
      return true;
    });

    result.sort((a, b) => {
      const aVal = String(a[sortField] || "").toLowerCase();
      const bVal = String(b[sortField] || "").toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return result;
  }, [contacts, search, categoryFilter, priorityFilter, whereMetFilter, haseBio, hasHowHelp, sortField, sortOrder]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, priorityFilter, whereMetFilter, haseBio, hasHowHelp]);

  const paginatedContacts = useMemo(() => {
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);

  // Calculate active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (search) count++;
    if (categoryFilter !== "All") count++;
    if (priorityFilter !== "all") count++;
    if (whereMetFilter) count++;
    if (haseBio) count++;
    if (hasHowHelp) count++;
    return count;
  }, [search, categoryFilter, priorityFilter, whereMetFilter, haseBio, hasHowHelp]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const toggleColumn = (col: SortField) => {
    const newCols = new Set(visibleColumns);
    if (newCols.has(col)) {
      newCols.delete(col);
    } else {
      newCols.add(col);
    }
    setVisibleColumns(newCols);
    localStorage.setItem("crm-visible-columns", JSON.stringify(Array.from(newCols)));
  };

  const handleUpdate = async (id: string, updates: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/crm/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updatedContact = contacts.find((c) => c.id === id);
        if (updatedContact) {
          for (const [key, val] of Object.entries(updates)) {
            const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            Object.assign(updatedContact, { [camelKey]: val });
          }
          if (selectedContact?.id === id) {
            setSelectedContact({ ...selectedContact, ...Object.fromEntries(
              Object.entries(updates).map(([k, v]) => [
                k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
                v,
              ])
            ) });
          }
        }
      }
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  const exportToCSV = () => {
    const headers = ["Name", "Company", "Category", "Priority", "Where Met", "Origin", "Bio", "How Help ZAO"];
    const rows = filtered.map((c) => [
      c.name,
      c.company || "",
      c.category || "",
      c.priority || "",
      c.whereMet || "",
      c.origin || "",
      c.bio || "",
      c.howHelpZao || "",
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAllFilters = () => {
    setSearch("");
    setCategoryFilter("All");
    setPriorityFilter("all");
    setWhereMetFilter("");
    setHasBio(false);
    setHasHowHelp(false);
    setShowFilters(false);
  };

  return (
    <div className="space-y-6">
      {/* Search and view mode top bar */}
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Search contacts by name, superhero, company, or bio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition"
        />

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                viewMode === "table"
                  ? "bg-blue-500/30 text-blue-200 border border-blue-400/50"
                  : "bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              Table
            </button>
            <button
              onClick={() => setViewMode("cards")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                viewMode === "cards"
                  ? "bg-blue-500/30 text-blue-200 border border-blue-400/50"
                  : "bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              Cards
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition relative ${
                showFilters
                  ? "bg-purple-500/30 text-purple-200 border border-purple-400/50"
                  : "bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              Filters
              {activeFiltersCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-purple-400/50 text-white">
                  {activeFiltersCount}
                </span>
              )}
            </button>
            {viewMode === "table" && (
              <button
                onClick={() => setShowColumnPicker(!showColumnPicker)}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition"
              >
                Columns
              </button>
            )}
            <button
              onClick={exportToCSV}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-green-500/30 text-green-200 border border-green-400/50 hover:bg-green-500/40 transition"
            >
              Export CSV
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-blue-500/30 text-blue-200 border border-blue-400/50 hover:bg-blue-500/40 transition"
            >
              Add Contact
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible filters panel */}
      {showFilters && (
        <div className="p-4 rounded-lg border border-white/10 bg-white/5 space-y-4">
          {/* Category filter chips */}
          <div className="space-y-2">
            <p className="text-xs text-white/50 font-medium uppercase tracking-wide">Category</p>
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
          </div>

          {/* Priority filter chips */}
          <div className="space-y-2">
            <p className="text-xs text-white/50 font-medium uppercase tracking-wide">Priority</p>
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
          </div>

          {/* Where Met filter */}
          {whereMetOptions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-white/50 font-medium uppercase tracking-wide">Where Met</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setWhereMetFilter("")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    whereMetFilter === ""
                      ? "bg-purple-500/30 text-purple-200 border border-purple-400/50"
                      : "bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  All
                </button>
                {whereMetOptions.map((val) => (
                  <button
                    key={val}
                    onClick={() => setWhereMetFilter(whereMetFilter === val ? "" : val)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      whereMetFilter === val
                        ? "bg-purple-500/30 text-purple-200 border border-purple-400/50"
                        : "bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Toggle filters */}
          <div className="space-y-2">
            <p className="text-xs text-white/50 font-medium uppercase tracking-wide">Toggles</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setHasBio(!haseBio)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  haseBio
                    ? "bg-teal-500/30 text-teal-200 border border-teal-400/50"
                    : "bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                Has Bio
              </button>
              <button
                onClick={() => setHasHowHelp(!hasHowHelp)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  hasHowHelp
                    ? "bg-teal-500/30 text-teal-200 border border-teal-400/50"
                    : "bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                Has How Help
              </button>
            </div>
          </div>

          {/* Clear all filters button */}
          {activeFiltersCount > 0 && (
            <div className="pt-2 border-t border-white/10">
              <button
                onClick={clearAllFilters}
                className="text-sm text-white/60 hover:text-white/80 transition font-medium"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Column picker */}
      {showColumnPicker && (
        <div className="p-4 rounded-lg border border-white/10 bg-white/5 space-y-2">
          <p className="text-sm font-medium text-white/70">Show/Hide Columns</p>
          <div className="flex flex-wrap gap-2">
            {TABLE_COLUMNS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => toggleColumn(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  visibleColumns.has(key)
                    ? "bg-blue-500/30 text-blue-200 border border-blue-400/50"
                    : "bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Result count */}
      <div className="text-sm text-white/50">
        Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} contacts
      </div>

      {/* Table view */}
      {viewMode === "table" && (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {TABLE_COLUMNS.map(({ key, label }) => (
                  visibleColumns.has(key) && (
                    <th key={key} className="px-4 py-3 text-left font-semibold text-white/80">
                      <button
                        onClick={() => handleSort(key)}
                        className="flex items-center gap-1 hover:text-white transition"
                      >
                        {label}
                        {sortField === key && (
                          <span>{sortOrder === "asc" ? " ↑" : " ↓"}</span>
                        )}
                      </button>
                    </th>
                  )
                ))}
                <th className="px-4 py-3 text-left font-semibold text-white/80">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedContacts.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-white/10 hover:bg-white/5 transition cursor-pointer"
                >
                  {TABLE_COLUMNS.map(({ key }) => (
                    visibleColumns.has(key) && (
                      <td key={key} className="px-4 py-3 text-white/70">
                        {key === "priority" ? (
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium border inline-block ${
                              c.priority === "high"
                                ? "bg-red-500/20 text-red-200 border-red-400/30"
                                : c.priority === "medium"
                                  ? "bg-amber-500/20 text-amber-200 border-amber-400/30"
                                  : "bg-green-500/20 text-green-200 border-green-400/30"
                            }`}
                          >
                            {c[key] || "-"}
                          </span>
                        ) : (
                          <span>{c[key] || "-"}</span>
                        )}
                      </td>
                    )
                  ))}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedContact(c)}
                      className="text-blue-400 hover:text-blue-300 transition text-sm"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Card view */}
      {viewMode === "cards" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paginatedContacts.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3 hover:bg-white/[0.08] transition cursor-pointer"
              onClick={() => setSelectedContact(c)}
            >
              <div>
                <h3 className="text-base font-semibold text-zao-gold">{c.name}</h3>
                {c.superheroName && <p className="text-xs text-white/60">{c.superheroName}</p>}
                {c.company && <p className="text-xs text-white/60">{c.company}</p>}
              </div>

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

              {c.bio && <p className="text-xs text-white/60 line-clamp-2">{c.bio}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 pt-4">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Previous
          </button>

          <div className="text-sm text-white/60">
            Page {currentPage} of {totalPages}
          </div>

          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Next
          </button>
        </div>
      )}

      {/* Detail drawer */}
      {selectedContact && (
        <DetailDrawer
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onUpdate={handleUpdate}
        />
      )}

      {/* Add form modal - placeholder */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zao-navy rounded-lg border border-white/10 p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zao-gold">Add Contact</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-white/60 hover:text-white text-2xl font-light"
              >
                ×
              </button>
            </div>
            <p className="text-white/60 text-sm mb-4">Add contact form will be implemented here</p>
            <button
              onClick={() => setShowAddForm(false)}
              className="w-full px-4 py-2 rounded-lg bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
