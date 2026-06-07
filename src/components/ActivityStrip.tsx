"use client";

import { useEffect, useState } from "react";

interface ActivityData {
  openIssues: number | null;
  mergedToday: number | null;
}

export default function ActivityStrip() {
  const [activity, setActivity] = useState<ActivityData | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/repo-activity", { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setActivity(data);
      })
      .catch(() => {
        // Silently fail / aborted on unmount - no activity shown
      });
    return () => ctrl.abort();
  }, []);

  if (!activity || (activity.openIssues == null && activity.mergedToday == null)) {
    return null;
  }

  return (
    <div className="text-[11px] text-white/50 px-2 py-1">
      ZAOOS: {activity.openIssues ?? "?"} open issues
      {activity.mergedToday != null && ` · ${activity.mergedToday} PR merged today`}
    </div>
  );
}
