"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function BraindumpPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-8 text-gray-400 hover:text-gray-300 flex items-center gap-2"
        >
          <span>←</span>
          Back
        </button>

        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-2">Braindump Surfaces</h1>
          <p className="text-gray-400 text-lg">
            Fast-capture surfaces for ideas, media, and todos with AI assistance.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Media Braindump Card */}
          <Link href="/braindump/media">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 hover:border-yellow-500 hover:bg-gray-800/80 transition-all cursor-pointer h-full">
              <div className="mb-4 text-3xl">📎</div>
              <h2 className="text-2xl font-bold mb-3">Media Braindump</h2>
              <p className="text-gray-400 mb-6">
                Quickly capture links, articles, videos, and other media. AI automatically generates summaries and
                suggests tags.
              </p>
              <div className="space-y-2 text-sm text-gray-500 mb-6">
                <div className="flex items-center gap-2">
                  <span>✓</span>
                  <span>Paste content or URL</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>✓</span>
                  <span>AI fetches and summarizes</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>✓</span>
                  <span>Auto-tag suggestions</span>
                </div>
              </div>
              <div className="text-yellow-500 font-semibold text-sm">Explore →</div>
            </div>
          </Link>

          {/* Ideas Braindump Card */}
          <Link href="/braindump/ideas">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 hover:border-yellow-500 hover:bg-gray-800/80 transition-all cursor-pointer h-full">
              <div className="mb-4 text-3xl">💭</div>
              <h2 className="text-2xl font-bold mb-3">Ideas & Todos Braindump</h2>
              <p className="text-gray-400 mb-6">
                Dump all your ideas and todos in free text. AI parses them into distinct tasks on your board with
                analysis.
              </p>
              <div className="space-y-2 text-sm text-gray-500 mb-6">
                <div className="flex items-center gap-2">
                  <span>✓</span>
                  <span>Free-text braindump</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>✓</span>
                  <span>AI extracts tasks</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>✓</span>
                  <span>Auto-comment with analysis</span>
                </div>
              </div>
              <div className="text-yellow-500 font-semibold text-sm">Explore →</div>
            </div>
          </Link>
        </div>

        {/* Info section */}
        <div className="mt-12 bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="font-semibold text-lg mb-3">How it works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-400">
            <div>
              <p className="font-medium text-white mb-2">Media Capture</p>
              <p>
                Drop a link or text. AI fetches the content, generates a summary, and suggests relevant tags. Stored
                for quick reference.
              </p>
            </div>
            <div>
              <p className="font-medium text-white mb-2">Task Parsing</p>
              <p>
                Braindump ideas freely. AI intelligently extracts distinct tasks and creates them on your board with a
                timestamp marker.
              </p>
            </div>
            <div>
              <p className="font-medium text-white mb-2">AI Conversation</p>
              <p>
                Each braindump task starts with an AI analysis comment. Reply to any task and AI responds with next
                steps or clarification.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
