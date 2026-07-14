// Shared UI components for the overview dashboard
// Defines a consistent card system, stat tiles, and headers

import React, { ReactNode } from "react";

// Base Card with consistent styling
interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-xl border bg-slate-800/40 border-slate-700/60 backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

// Section header with consistent styling
interface SectionHeaderProps {
  label: string;
  accent?: "blue" | "amber" | "green" | "red" | "purple" | "slate";
  children?: ReactNode;
}

export function SectionHeader({
  label,
  accent = "slate",
  children,
}: SectionHeaderProps) {
  const accentMap = {
    blue: "text-blue-200",
    amber: "text-amber-200",
    green: "text-green-200",
    red: "text-red-200",
    purple: "text-purple-200",
    slate: "text-slate-200",
  };

  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className={`text-xs font-semibold uppercase tracking-wider ${accentMap[accent]}`}>
        {label}
      </h2>
      {children && <div className="text-xs text-white/50">{children}</div>}
    </div>
  );
}

// Stat tile (single stat with label)
interface StatTileProps {
  label: string;
  value: string | number;
  accent?: "blue" | "indigo" | "purple" | "green" | "red" | "orange" | "amber" | "emerald";
  size?: "sm" | "md";
}

export function StatTile({ label, value, accent = "blue", size = "md" }: StatTileProps) {
  const accentMap = {
    blue: "bg-blue-500/10 border-blue-500/20 text-blue-300 text-blue-200/70",
    indigo: "bg-indigo-500/10 border-indigo-500/20 text-indigo-300 text-indigo-200/70",
    purple: "bg-purple-500/10 border-purple-500/20 text-purple-300 text-purple-200/70",
    green: "bg-green-500/10 border-green-500/20 text-green-300 text-green-200/70",
    red: "bg-red-500/10 border-red-500/20 text-red-300 text-red-200/70",
    orange: "bg-orange-500/10 border-orange-500/20 text-orange-300 text-orange-200/70",
    amber: "bg-amber-500/10 border-amber-500/20 text-amber-300 text-amber-200/70",
    emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300 text-emerald-200/70",
  };

  const [bgBorder, textValue, textLabel] = accentMap[accent].split(" ");

  return (
    <div className={`rounded-lg ${bgBorder} border p-3`}>
      <div className={`text-xs ${textLabel}`}>{label}</div>
      <div className={`text-${size === "sm" ? "lg" : "2xl"} font-bold ${textValue} mt-1`}>
        {value}
      </div>
    </div>
  );
}

// Loading skeleton
export function CardSkeleton() {
  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="h-4 bg-slate-700/50 rounded w-1/3 animate-pulse" />
        <div className="h-3 bg-slate-700/50 rounded w-full animate-pulse" />
        <div className="h-3 bg-slate-700/50 rounded w-5/6 animate-pulse" />
      </div>
    </Card>
  );
}

// Stacked horizontal bar (status distribution)
interface StackedBarProps {
  segments: Array<{ label: string; value: number; color: string }>;
  total: number;
}

export function StackedBar({ segments, total }: StackedBarProps) {
  if (total === 0) {
    return <div className="h-6 rounded bg-slate-700/30 flex items-center justify-center text-xs text-white/40">
      No data
    </div>;
  }

  return (
    <div className="flex gap-0.5 h-6 rounded overflow-hidden bg-slate-800/50 border border-slate-700/30">
      {segments.map((segment) => {
        const percentage = (segment.value / total) * 100;
        return (
          <div
            key={segment.label}
            className={`${segment.color} relative`}
            style={{ width: `${Math.max(percentage, 2)}%` }}
            title={`${segment.label}: ${segment.value}`}
          />
        );
      })}
    </div>
  );
}

// Progress bar (for goals or tasks)
interface ProgressBarProps {
  label: string;
  value: number;
  max: number;
  color?: "green" | "amber" | "red" | "blue";
}

export function ProgressBar({ label, value, max, color = "blue" }: ProgressBarProps) {
  const percentage = max === 0 ? 0 : (value / max) * 100;
  const colorMap = {
    green: "bg-green-500/50",
    amber: "bg-amber-500/50",
    red: "bg-red-500/50",
    blue: "bg-blue-500/50",
  };

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-white/70 min-w-16">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-slate-700/50 border border-slate-600/30 overflow-hidden">
        <div
          className={`h-full ${colorMap[color]} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-white/50 min-w-12 text-right">{value}/{max}</span>
    </div>
  );
}

// Status badge
interface BadgeProps {
  status: "on-track" | "at-risk" | "blocked" | "done" | "not-started" | "active" | "recent" | "stale";
  label?: string;
}

export function Badge({ status, label }: BadgeProps) {
  const statusMap: Record<
    string,
    { bg: string; text: string; defaultLabel: string }
  > = {
    "on-track": {
      bg: "bg-green-500/20 border-green-500/30",
      text: "text-green-200",
      defaultLabel: "ON TRACK",
    },
    "at-risk": {
      bg: "bg-amber-500/20 border-amber-500/30",
      text: "text-amber-200",
      defaultLabel: "AT RISK",
    },
    blocked: {
      bg: "bg-red-500/20 border-red-500/30",
      text: "text-red-200",
      defaultLabel: "BLOCKED",
    },
    done: {
      bg: "bg-emerald-500/20 border-emerald-500/30",
      text: "text-emerald-200",
      defaultLabel: "DONE",
    },
    "not-started": {
      bg: "bg-slate-500/20 border-slate-500/30",
      text: "text-slate-300",
      defaultLabel: "NOT STARTED",
    },
    active: {
      bg: "bg-green-500/20 border-green-500/40",
      text: "text-green-300",
      defaultLabel: "ACTIVE",
    },
    recent: {
      bg: "bg-yellow-500/20 border-yellow-500/40",
      text: "text-yellow-300",
      defaultLabel: "RECENT",
    },
    stale: {
      bg: "bg-red-500/20 border-red-500/40",
      text: "text-red-300",
      defaultLabel: "STALE",
    },
  };

  const style = statusMap[status];
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold border whitespace-nowrap ${style.bg} ${style.text}`}
    >
      {label || style.defaultLabel}
    </span>
  );
}
