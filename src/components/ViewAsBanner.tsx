"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function ViewAsBanner({ effectiveUser, currentUser }: { effectiveUser: string; currentUser: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (effectiveUser === currentUser) {
    return null;
  }

  function exitView() {
    const url = new URL(window.location.href);
    url.searchParams.delete("viewAs");
    router.push(url.toString());
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-amber-200 text-sm font-medium flex-shrink-0">Viewing as</span>
        <span className="text-amber-100 font-semibold truncate">{effectiveUser}</span>
        <span className="text-amber-200/60 text-xs flex-shrink-0">(Zaal view)</span>
      </div>
      <button
        onClick={exitView}
        className="text-amber-200 hover:text-white border border-amber-500/40 hover:border-amber-400 rounded-md px-2.5 py-1 text-xs font-medium transition flex-shrink-0"
      >
        Exit view
      </button>
    </div>
  );
}
