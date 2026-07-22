"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MEDIA_TAGS = ["Music", "Video", "Article", "Idea", "Reference", "Code", "Research"];

interface SubmitResponse {
  success: boolean;
  error?: string;
  id?: string;
  ai_summary?: string;
  suggested_tags?: string[];
}

export default function MediaBraindumpPage() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SubmitResponse | null>(null);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/braindump/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          url: url.trim() || undefined,
          tags: selectedTags,
        }),
      });

      const data = (await response.json()) as SubmitResponse;
      setResult(data);

      if (data.success) {
        setContent("");
        setUrl("");
        setSelectedTags([]);
        setTimeout(() => {
          setResult(null);
          router.refresh();
        }, 2000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Media Braindump</h1>
        <p className="text-gray-400 mb-8">Quickly capture media, links, and ideas with AI summaries.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Content input */}
          <div>
            <label className="block text-sm font-medium mb-2">What is this about?</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste a link, describe what you found, or add context..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 resize-none"
              rows={4}
              disabled={isLoading}
            />
          </div>

          {/* URL input */}
          <div>
            <label className="block text-sm font-medium mb-2">Link (optional)</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1">AI will fetch and summarize this link.</p>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium mb-3">Tags (click to add)</label>
            <div className="flex flex-wrap gap-2">
              {MEDIA_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  disabled={isLoading}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedTags.includes(tag)
                      ? "bg-yellow-500 text-gray-900"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Submit button */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isLoading || !content.trim()}
              className="flex-1 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-700 text-gray-900 font-bold py-3 px-4 rounded-lg transition-colors"
            >
              {isLoading ? "Processing..." : "Capture Media"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition-colors"
            >
              Back
            </button>
          </div>
        </form>

        {/* Result message */}
        {result && (
          <div
            className={`mt-8 p-4 rounded-lg ${
              result.success
                ? "bg-green-900/30 border border-green-700 text-green-300"
                : "bg-red-900/30 border border-red-700 text-red-300"
            }`}
          >
            {result.success ? (
              <div>
                <p className="font-semibold mb-2">Capture successful!</p>
                <p className="text-sm mb-3">{result.ai_summary}</p>
                {result.suggested_tags && result.suggested_tags.length > 0 && (
                  <p className="text-xs text-gray-400">
                    Tags: {result.suggested_tags.join(", ")}
                  </p>
                )}
              </div>
            ) : (
              <p>{result.error || "An error occurred"}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
