"use client";

import { useState } from "react";
import { createItem } from "@/app/actions";

interface EventFormProps {
  onSuccess?: () => void;
}

export function EventForm({ onSuccess }: EventFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    eventAt: "",
    eventLocation: "",
    eventUrl: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (!formData.title.trim()) {
        setError("Event title is required");
        return;
      }
      if (!formData.eventAt) {
        setError("Event date and time are required");
        return;
      }

      // Validate the datetime
      const eventDate = new Date(formData.eventAt);
      if (isNaN(eventDate.getTime())) {
        setError("Invalid date or time format");
        return;
      }

      // Build FormData for the server action
      const fd = new FormData();
      fd.set("title", formData.title.trim());
      fd.set("priority", "P2");
      fd.set("phase", "Define");
      fd.set("status", "TODO");
      fd.set("category", "Other");
      fd.set("owner", "Open");
      fd.set("important", "0");
      fd.set("urgent", "0");
      fd.set("taskType", "event");
      fd.set("isEvent", "true");
      fd.set("notes", formData.notes);
      fd.set("eventAt", formData.eventAt);
      if (formData.eventLocation) {
        fd.set("eventLocation", formData.eventLocation);
      }
      if (formData.eventUrl) {
        fd.set("eventUrl", formData.eventUrl);
      }

      await createItem(fd);

      // Reset form
      setFormData({
        title: "",
        eventAt: "",
        eventLocation: "",
        eventUrl: "",
        notes: "",
      });
      setIsOpen(false);

      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-1.5 text-sm font-medium rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition border border-cyan-500/50"
      >
        + Add Event
      </button>
    );
  }

  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-lg space-y-3">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-white/60 mb-1">
            Event Title
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g. ZAO Meetup"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
            disabled={isLoading}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1">
              Date & Time
            </label>
            <input
              type="datetime-local"
              value={formData.eventAt}
              onChange={(e) => setFormData({ ...formData, eventAt: e.target.value })}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white focus:outline-none focus:border-blue-500/50"
              disabled={isLoading}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1">
              Location (optional)
            </label>
            <input
              type="text"
              value={formData.eventLocation}
              onChange={(e) => setFormData({ ...formData, eventLocation: e.target.value })}
              placeholder="e.g. Zoom / Park"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
              disabled={isLoading}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-white/60 mb-1">
            Event Link (optional)
          </label>
          <input
            type="url"
            value={formData.eventUrl}
            onChange={(e) => setFormData({ ...formData, eventUrl: e.target.value })}
            placeholder="https://..."
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-white/60 mb-1">
            Notes (optional)
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Additional details..."
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
            rows={2}
            disabled={isLoading}
          />
        </div>

        {error && (
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded p-2">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 px-3 py-2 bg-cyan-500 text-white text-sm font-medium rounded hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isLoading ? "Creating..." : "Create Event"}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setError(null);
            }}
            disabled={isLoading}
            className="px-3 py-2 bg-white/10 text-white text-sm font-medium rounded hover:bg-white/20 disabled:opacity-50 transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
