"use client";

import { useRouter } from "next/navigation";

// Reusable one-click back / quick-nav control. Returns to the previous view in
// the browser history; if there's no history to go back to (e.g. the page was
// opened from a deep link or a fresh tab) it falls back to `fallback`.
//
// General-purpose by design — drop it anywhere a "go back" affordance is wanted
// and pass `fallback`/`label`/`className` to fit the spot. Exact placement on
// each page is set by the caller.
export function BackButton({
  fallback = "/",
  label = "Back",
  className,
}: {
  fallback?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={label}
      className={
        className ??
        "inline-flex items-center gap-1.5 text-xs rounded-lg border border-white/10 px-2.5 py-1.5 text-white/70 hover:bg-white/5 hover:text-white transition"
      }
    >
      <span aria-hidden="true">←</span>
      {label}
    </button>
  );
}
