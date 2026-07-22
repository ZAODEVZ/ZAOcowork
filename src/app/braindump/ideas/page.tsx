"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SubmitResponse {
  success: boolean;
  error?: string;
  tasks_created?: number;
  task_ids?: string[];
}

export default function IdeasBraindumpPage() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SubmitResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/braindump/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
        }),
      });

      const data = (await response.json()) as SubmitResponse;
      setResult(data);

      if (data.success) {
        setContent("");
        setTimeout(() => {
          setResult(null);
          router.push("/board");
        }, 2000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Ideas & Todos Braindump</h1>
        <p className="text-gray-400 mb-2">
          Dump all your ideas and todos here. AI will parse them into distinct tasks on your board.
        </p>
        <p className="text-gray-500 text-sm mb-8">
          Each task gets an AI analysis as the first comment. You can then discuss further in the task detail view.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Content input */}
          <div>
            <label className="block text-sm font-medium mb-2">Brain dump</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write everything that comes to mind. Ideas, tasks, improvements, questions... Put one per line or separated naturally."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 resize-vertical font-mono text-sm"
              rows={12}
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-2">
              AI will analyze this and create structured tasks on your board.
            </p>
          </div>

          {/* Submit button */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isLoading || !content.trim()}
              className="flex-1 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-700 text-gray-900 font-bold py-3 px-4 rounded-lg transition-colors"
            >
              {isLoading ? "Processing..." : "Parse & Create Tasks"}
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
                <p className="font-semibold mb-2">
                  {result.tasks_created === 0
                    ? "No tasks were parsed."
                    : `${result.tasks_created} ${result.tasks_created === 1 ? "task" : "tasks"} created!`}
                </p>
                {result.tasks_created !== 0 && (
                  <p className="text-sm text-gray-300">
                    Redirecting to board in 2 seconds...
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
