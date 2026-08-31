"use client";

import { useEffect, useState } from "react";
import { Card, SectionHeader } from "./ui";

// heartbeatKey maps to bot_heartbeats.bot (VPS-side; ZOL runs on the Pi and
// isn't heartbeat-tracked yet, so it stays status-less rather than a fake dot).
const SURFACES = [
  {
    name: "ZOE",
    handle: "@zaoclaw_bot",
    description: "Orchestrator - tasks, captures, auto-PR pipeline",
    color: "bg-blue-500/10 border-blue-500/20",
    heartbeatKey: "zoe",
  },
  {
    name: "ZOL",
    handle: "@zolbot",
    description: "Farcaster agentic account on Pi",
    color: "bg-purple-500/10 border-purple-500/20",
    heartbeatKey: null,
  },
  {
    name: "ZAO Devz",
    handle: "@zaodevz_bot",
    description: "Group dispatch + hourly learning tip",
    color: "bg-green-500/10 border-green-500/20",
    heartbeatKey: "zaodevz",
  },
  {
    name: "ZAOstock",
    handle: "@ZAOstockTeamBot",
    description: "Festival team coordination",
    color: "bg-orange-500/10 border-orange-500/20",
    heartbeatKey: "zaostock",
  },
  {
    name: "ZAO Cowork",
    handle: "cowork-agent",
    description: "This app's own backend agent (board sync, comments)",
    color: "bg-cyan-500/10 border-cyan-500/20",
    heartbeatKey: "zaocoworking",
  },
  {
    name: "farscout",
    handle: "Discord",
    description: "Autonomous Farcaster/Reddit/X research scout, writes to Bonfire",
    color: "bg-pink-500/10 border-pink-500/20",
    heartbeatKey: "farscout",
  },
];

interface HarnessRow {
  bot: string;
  status: string;
  updated_at: string;
}

function agoShort(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}

const QUICK_LINKS = [
  { label: "The ZAO", url: "/" },
  { label: "Papers", url: "/papers" },
  { label: "Fractals", url: "https://thezao.xyz/fractals" },
  { label: "Board", url: "/board" },
  { label: "Research", url: "https://github.com/ZAODEVZ/ZAOOS/tree/main/research" },
];

export function SurfacesWidget() {
  const [harnesses, setHarnesses] = useState<HarnessRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/hud")
      .then((r) => r.json())
      .then((d) => {
        if (alive && d.ok) setHarnesses(d.harnesses ?? []);
      })
      .catch(() => {
        if (alive) setHarnesses([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Card className="p-6">
      <SectionHeader label="Surfaces & Lanes" accent="slate" />

      {/* Operating surfaces */}
      <div className="mb-8">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
          Operating Bots
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {SURFACES.map((surface) => {
            const live = surface.heartbeatKey
              ? harnesses?.find((h) => h.bot === surface.heartbeatKey)
              : undefined;
            return (
              <div
                key={surface.name}
                className={`rounded-lg border p-3 ${surface.color} hover:border-white/40 transition-colors`}
              >
                <div className="flex items-center gap-1.5">
                  {live && (
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: live.status === "up" ? "#3fb950" : "#d9534f" }}
                      title={live.status === "up" ? "up" : "down"}
                    />
                  )}
                  <div className="font-semibold text-sm text-white">{surface.name}</div>
                </div>
                <div className="text-xs text-white/60 mt-0.5">{surface.handle}</div>
                <div className="text-xs text-white/50 mt-1 line-clamp-2">
                  {surface.description}
                </div>
                {live && (
                  <div className="text-[10px] text-white/40 mt-1 font-mono">
                    {live.status === "up" ? "up" : "down"} · {agoShort(live.updated_at)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick links */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
          Key Pages
        </h3>
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target={link.url.startsWith("/") ? undefined : "_blank"}
              rel={link.url.startsWith("/") ? undefined : "noopener noreferrer"}
              className="rounded-lg bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600 hover:border-white/40 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </Card>
  );
}
