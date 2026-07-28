"use client";

import { useEffect, useState } from "react";

// PWA home-screen / dock badge via the Badging API.
//
// The number is deliberately NOT "how many tasks do I have" - Zaal has 238 open,
// and a permanent 238 on the icon is wallpaper, not a signal. It is the count of
// work that needs him TODAY: overdue plus at-risk. That decays to zero when he
// is clear, which is what makes the badge worth looking at.
//
// Support notes:
//   Chrome/Edge desktop  - works once the PWA is installed.
//   iOS 16.4+            - works for a home-screen web app, but ONLY if
//                          Notification permission has been granted. That is an
//                          Apple requirement, not ours.
//   Everything else      - navigator.setAppBadge is undefined; this no-ops.
//
// We never auto-prompt for permission. An unprompted permission dialog on page
// load is the fastest way to get permanently denied. The button below only
// appears when the API exists and permission is still "default".

// Not `extends Navigator` - the TS DOM lib already declares these as required,
// and they are absent at runtime on unsupported browsers. A standalone shape
// keeps the optional-ness honest.
type BadgeNav = {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

function badgeNav(): BadgeNav | null {
  if (typeof navigator === "undefined") return null;
  const n = navigator as unknown as BadgeNav;
  return typeof n.setAppBadge === "function" ? n : null;
}

export function AppBadge({ count, label }: { count: number; label?: string }) {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("unsupported");

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setPerm(Notification.permission);
  }, []);

  useEffect(() => {
    const n = badgeNav();
    if (!n) return;
    let cancelled = false;

    (async () => {
      try {
        if (count > 0) await n.setAppBadge?.(count);
        else await n.clearAppBadge?.();
      } catch {
        // Badge failures are cosmetic - never surface an error for this.
      }
    })();

    return () => {
      cancelled = true;
      void cancelled;
    };
  }, [count]);

  // Clear the badge when the app is closed so a stale number does not persist
  // after the work is done in another session.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && count === 0) {
        void badgeNav()?.clearAppBadge?.();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [count]);

  // Only ask when the platform needs it AND the user has not decided yet.
  const needsPermission = badgeNav() !== null && perm === "default";
  if (!needsPermission) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          const result = await Notification.requestPermission();
          setPerm(result);
          if (result === "granted" && count > 0) {
            await badgeNav()?.setAppBadge?.(count);
          }
        } catch {
          /* user dismissed - nothing to do */
        }
      }}
      className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/[0.08] transition"
      title="Show a count on the app icon for work that needs you today"
    >
      Enable app badge{label ? ` (${label})` : ""}
    </button>
  );
}
