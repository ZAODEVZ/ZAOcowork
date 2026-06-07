"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Red count badge on the Activity nav tab showing comment @mentions of the
// current user newer than the last time they opened /activity. "Seen" is a
// per-browser localStorage marker (the timestamp of the newest mention at the
// moment they last viewed Activity). Self-contained: derives the user from the
// session cookie via /api/my-mentions, so NavBar needs no extra props.
const SEEN_KEY = "zao-activity-mentions-seen-v1";

export function MentionsBadge() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const seen =
      typeof window !== "undefined" ? window.localStorage.getItem(SEEN_KEY) ?? "" : "";
    const qs = seen ? `?since=${encodeURIComponent(seen)}` : "";
    fetch(`/api/my-mentions${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { unread?: number; latestAt?: string | null } | null) => {
        if (cancelled || !d) return;
        if (pathname === "/activity") {
          // Viewing the feed marks everything up to the newest mention as seen.
          if (d.latestAt) window.localStorage.setItem(SEEN_KEY, d.latestAt);
          setUnread(0);
          return;
        }
        setUnread(d.unread ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (unread <= 0) return null;
  return (
    <span className="absolute -top-1.5 -right-1.5 z-10 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[9px] font-bold leading-none flex items-center justify-center text-white pointer-events-none">
      {unread > 9 ? "9+" : unread}
    </span>
  );
}
