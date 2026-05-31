"use client";

// Route-level error boundary. Without this, any thrown render error (e.g. a
// task with malformed comment/update data hitting TaskRoom during SSR on a
// ?task= deep link) white-screens the whole app with the generic
// "Application error: a server-side exception has occurred" page and no way
// back. This catches it, surfaces the digest so we can match it to the
// Vercel server logs, logs the error object to the browser console for
// support, and offers a retry + a link back to the board.
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Visible in the browser console so a teammate can screenshot it. Note:
    // in production builds the real message/stack is redacted by Next.js and
    // only `digest` is meaningful — the full stack lives in the Vercel logs.
    console.error("[zao-cowork] route error", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#041225] text-white px-4">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center space-y-4">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-white/60">
          This page hit an error while loading. The team has been notified — you
          can retry, or head back to the board.
        </p>
        {error.digest && (
          <p className="text-[11px] text-white/40">
            Reference code: <span className="font-mono text-white/70">{error.digest}</span>
          </p>
        )}
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            onClick={reset}
            className="rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-medium transition"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition"
          >
            Back to board
          </a>
        </div>
      </div>
    </main>
  );
}
